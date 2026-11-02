#!/usr/bin/env sh
set -eu

app_dir="${APP_DIR:-/opt/workflow-automation}"
bundle_dir="${RELEASE_BUNDLE:-$app_dir}"
scripts_dir="$bundle_dir/infra/scripts"
env_file="${ENV_FILE:-$app_dir/.env.production}"
compose_file="$app_dir/infra/docker-compose.production.yml"
image_tag="${IMAGE_TAG:-}"
api_image="${API_IMAGE:-ghcr.io/phuuthanh-dev/workflow-automation-api}"
web_image="${WEB_IMAGE:-ghcr.io/phuuthanh-dev/workflow-automation-web}"
# Compose must use the same resolved images and immutable tag for every call,
# including when the caller relies on these defaults rather than exported vars.
export API_IMAGE="$api_image" WEB_IMAGE="$web_image" IMAGE_TAG="$image_tag"
previous_api_image_tag=""
previous_web_image_tag=""

if [ ! -f "$env_file" ]; then
  printf '%s\n' "Missing production env file: $env_file" >&2
  exit 1
fi

if [ ! -f "$compose_file" ]; then
  printf '%s\n' "Missing compose file: $compose_file" >&2
  exit 1
fi

# Compose continues to resolve env files and volumes from the active project.
# Changing this contract needs a separate, verified promotion procedure.
if [ "$bundle_dir" != "$app_dir" ] && ! cmp -s "$bundle_dir/infra/docker-compose.production.yml" "$compose_file"; then
  printf '%s\n' "Bundle Compose differs from the active contract; deployment was not started." >&2
  exit 1
fi

sh "$scripts_dir/validate-image-tag.sh" "$image_tag" >/dev/null
. "$scripts_dir/release-lock.sh"
acquire_release_lock "$app_dir"
APP_DIR="$app_dir" sh "$scripts_dir/check-disk-space.sh"

api_container_id="$(API_IMAGE="$api_image" WEB_IMAGE="$web_image" IMAGE_TAG="$image_tag" \
  docker compose --env-file "$env_file" -f "$compose_file" ps -q api 2>/dev/null || true)"
if [ -n "$api_container_id" ]; then
  previous_api_image="$(docker inspect --format '{{.Config.Image}}' "$api_container_id" 2>/dev/null || true)"
  case "$previous_api_image" in
    "$api_image":*) previous_api_image_tag="${previous_api_image#"$api_image:"}" ;;
  esac
fi

web_container_id="$(API_IMAGE="$api_image" WEB_IMAGE="$web_image" IMAGE_TAG="$image_tag" \
  docker compose --env-file "$env_file" -f "$compose_file" ps -q web 2>/dev/null || true)"
if [ -n "$web_container_id" ]; then
  previous_web_image="$(docker inspect --format '{{.Config.Image}}' "$web_container_id" 2>/dev/null || true)"
  case "$previous_web_image" in
    "$web_image":*) previous_web_image_tag="${previous_web_image#"$web_image:"}" ;;
  esac
fi

docker compose --env-file "$env_file" -f "$compose_file" pull migrate api worker web

# NX jobs and saved graphs cannot be consumed by an older worker. Check the
# actual pulled image and every Compose API/worker container before migrating or
# replacing services; a healthy old process is not evidence of compatibility.
target_compatibility="$(docker image inspect --format '{{ index .Config.Labels "io.fluxora.execution-compatibility" }}' "$api_image:$image_tag")" || {
  printf '%s\n' "Cannot inspect target API compatibility; deployment was not started." >&2
  exit 1
}
if [ "$target_compatibility" != nx-v1 ]; then
  printf '%s\n' "Target API image is not certified for NX; deployment was not started." >&2
  exit 1
fi
require_compatible_fleet

# Inspect before stopping workers when the existing database is already up.
# A second check after the drain closes the window in which a new ambiguous
# continuation could appear while a compatible API is still serving requests.
existing_db="$(API_IMAGE="$api_image" WEB_IMAGE="$web_image" IMAGE_TAG="$image_tag" \
  docker compose --env-file "$env_file" -f "$compose_file" ps -q db)" || {
  printf '%s\n' "Cannot inspect the current database; deployment was not started." >&2; exit 1
}
if [ -n "$existing_db" ]; then
  require_unambiguous_continuations
fi

# Publish operator tooling only after both compatibility gates and while the
# shared release lock is held. Preserve the prior scripts before replacement;
# individual renames are atomic, but the set as a whole is not transactional.
if [ "$bundle_dir" != "$app_dir" ]; then
  active_scripts="$app_dir/infra/scripts"
  if ! cmp -s "$bundle_dir/infra/docker-compose.production.yml" "$compose_file"; then
    printf '%s\n' "Active Compose changed after the initial check; deployment was not started." >&2; exit 1
  fi
  for required in release-lock.sh rollback.sh deploy.sh validate-image-tag.sh check-disk-space.sh backup-postgres.sh healthcheck.sh prune-application-images.sh restore-postgres.sh; do
    if [ ! -f "$scripts_dir/$required" ] || [ -L "$scripts_dir/$required" ]; then
      printf '%s\n' "Release bundle is missing a required script." >&2; exit 1
    fi
  done
  for source in "$scripts_dir"/*.sh; do
    [ -f "$source" ] && [ ! -L "$source" ] || { printf '%s\n' "Invalid release script." >&2; exit 1; }
    name="$(basename "$source")"
    destination="$active_scripts/$name"
    if [ -L "$destination" ] || { [ -e "$destination" ] && [ ! -f "$destination" ]; }; then
      printf '%s\n' "Active release script is not a regular file." >&2; exit 1
    fi
  done
  umask 077
  backup_root="$app_dir/.release-tooling-backups"
  mkdir -p "$backup_root"
  backup_dir="$backup_root/$image_tag-$$"
  mkdir "$backup_dir"
  for source in "$scripts_dir"/*.sh; do
    name="$(basename "$source")"
    if [ -f "$active_scripts/$name" ]; then cp -p "$active_scripts/$name" "$backup_dir/$name"; else printf '%s\n' "$name" >> "$backup_dir/previously-absent"; fi
  done
  retain_release_lock
  # Publish the lock and guarded rollback before any schema migration.
  for name in release-lock.sh rollback.sh deploy.sh; do
    temporary="$active_scripts/.$name.pending.$$"
    [ ! -e "$temporary" ] && [ ! -L "$temporary" ] || { printf '%s\n' "Temporary release script already exists." >&2; exit 1; }
    cp "$scripts_dir/$name" "$temporary"
    chmod 755 "$temporary"
    mv -f "$temporary" "$active_scripts/$name"
  done
  for source in "$scripts_dir"/*.sh; do
    name="$(basename "$source")"
    case "$name" in release-lock.sh|rollback.sh|deploy.sh) continue ;; esac
    temporary="$active_scripts/.$name.pending.$$"
    [ ! -e "$temporary" ] && [ ! -L "$temporary" ] || { printf '%s\n' "Temporary release script already exists." >&2; exit 1; }
    cp "$source" "$temporary"
    chmod 755 "$temporary"
    mv -f "$temporary" "$active_scripts/$name"
  done
  release_lock_when_safe
fi

# The worker handles SIGTERM by closing BullMQ and waiting for active jobs.
# Do not use Compose's default finite stop timeout, which can SIGKILL a job
# after it has already written to a provider. New jobs remain in Redis.
restore_stopped_worker() {
  retain_release_lock
  # Restore only containers that were running before this release. Compose
  # start would also start intentionally stopped/scaled-down containers.
  for stopped_worker_id in $stopping_worker_ids; do
    if ! docker start "$stopped_worker_id" >/dev/null; then
      printf '%s\n' "Could not restart an original worker; inspect the queue and services." >&2
      return 1
    fi
    restarted_state="$(docker inspect --format '{{.State.Status}}' "$stopped_worker_id")" || return 1
    if [ "$restarted_state" != running ]; then
      printf '%s\n' "An original worker did not remain running; inspect the queue and services." >&2
      return 1
    fi
  done
  release_lock_when_safe
}
stopping_worker_ids="$(API_IMAGE="$api_image" WEB_IMAGE="$web_image" IMAGE_TAG="$image_tag" \
  docker compose --env-file "$env_file" -f "$compose_file" ps -q worker)" || {
  printf '%s\n' "Cannot list current workers; deployment was not started." >&2; exit 1
}
retain_release_lock
if ! docker compose --env-file "$env_file" -f "$compose_file" stop --timeout -1 worker; then
  # A failed/disconnected client cannot prove whether the daemon is still
  # stopping a worker. Never send a second signal or start a competing release.
  printf '%s\n' "Worker drain outcome is uncertain; migration was not started. Inspect the worker and retained lock." >&2
  exit 1
fi
require_clean_worker_exit "$stopping_worker_ids"
release_lock_when_safe
if ! docker compose --env-file "$env_file" -f "$compose_file" up -d --wait db redis; then
  printf '%s\n' "Dependencies were not ready; migration was not started." >&2
  restore_stopped_worker
  exit 1
fi
# Do not guess or restart workers when legacy continuation state needs review.
retain_release_lock
require_unambiguous_continuations
release_lock_when_safe
if ! APP_DIR="$app_dir" ENV_FILE="$env_file" sh "$scripts_dir/backup-postgres.sh"; then
  printf '%s\n' "Backup failed; migration was not started." >&2
  restore_stopped_worker
  exit 1
fi
# Once migration starts the schema may be partially changed. Do not
# automatically restart a previous image; use the compatibility-aware runbook.
retain_release_lock
if [ "$bundle_dir" != "$app_dir" ] && ! cmp -s "$bundle_dir/infra/docker-compose.production.yml" "$compose_file"; then
  printf '%s\n' "Active Compose changed before migration; inspect the retained lock." >&2; exit 1
fi
docker compose --env-file "$env_file" -f "$compose_file" up -d migrate
docker compose --env-file "$env_file" -f "$compose_file" up -d api worker web

APP_DIR="$app_dir" sh "$scripts_dir/healthcheck.sh"
require_target_worker
release_lock_when_safe
API_IMAGE="$api_image" WEB_IMAGE="$web_image" IMAGE_TAG="$image_tag" \
PREVIOUS_API_IMAGE_TAG="$previous_api_image_tag" PREVIOUS_WEB_IMAGE_TAG="$previous_web_image_tag" \
  sh "$scripts_dir/prune-application-images.sh"
docker compose --env-file "$env_file" -f "$compose_file" ps

