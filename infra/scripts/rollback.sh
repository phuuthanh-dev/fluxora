#!/usr/bin/env sh
set -eu

if [ "$#" -ne 1 ]; then
  printf '%s\n' "Usage: $0 <known-good-image-tag>" >&2
  exit 1
fi

app_dir="${APP_DIR:-/opt/workflow-automation}"
env_file="${ENV_FILE:-$app_dir/.env.production}"
compose_file="$app_dir/infra/docker-compose.production.yml"
image_tag="$1"
api_image="${API_IMAGE:-ghcr.io/phuuthanh-dev/workflow-automation-api}"
web_image="${WEB_IMAGE:-ghcr.io/phuuthanh-dev/workflow-automation-web}"

"$app_dir/infra/scripts/validate-image-tag.sh" "$image_tag" >/dev/null
. "$app_dir/infra/scripts/release-lock.sh"
acquire_release_lock "$app_dir"

# Migration records are a conservative boundary: even a record marked rolled
# back does not prove that the database and saved graphs were actually reverted.
# This check is deliberately independent of current queue/workflow contents.
migration_sql="SELECT CASE WHEN EXISTS (SELECT 1 FROM \"_prisma_migrations\" WHERE migration_name IN ('20261103120000_kuma_delivery_digest', '20261103130000_rss_trigger_checkpoint', '20261103140000_approval_continuation', '20261103150000_execution_run_token')) THEN 'nx' ELSE 'legacy' END"
nx_state="$(API_IMAGE="$api_image" WEB_IMAGE="$web_image" IMAGE_TAG="$image_tag" \
  docker compose --env-file "$env_file" -f "$compose_file" exec -T db \
  sh -c 'exec psql -X -qAt -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" -c "$1"' sh "$migration_sql")" || {
  printf '%s\n' "Cannot establish database compatibility; rollback was not started." >&2
  exit 1
}
case "$nx_state" in
  nx|legacy) ;;
  *) printf '%s\n' "Unexpected database compatibility result; rollback was not started." >&2; exit 1 ;;
esac

# Avoid stopping a healthy worker for ambiguity already present at preflight.
# The check is repeated after draining to detect an intervening change.
require_unambiguous_continuations
API_IMAGE="$api_image" WEB_IMAGE="$web_image" IMAGE_TAG="$image_tag" docker compose --env-file "$env_file" -f "$compose_file" pull api worker web
if [ "$nx_state" = nx ]; then
  compatibility="$(docker image inspect --format '{{ index .Config.Labels "io.fluxora.execution-compatibility" }}' "$api_image:$image_tag")" || {
    printf '%s\n' "Cannot inspect target API image; rollback was not started." >&2
    exit 1
  }
  if [ "$compatibility" != nx-v1 ]; then
    printf '%s\n' "Target image is not certified for NX execution and saved graphs; rollback was not started." >&2
    exit 1
  fi
fi
# A compatible image must still wait for active provider calls to finish.
# Jobs enqueued after this stop remain in Redis for the replacement worker.
stopping_worker_ids="$(API_IMAGE="$api_image" WEB_IMAGE="$web_image" IMAGE_TAG="$image_tag" \
  docker compose --env-file "$env_file" -f "$compose_file" ps -q worker)" || {
  printf '%s\n' "Cannot list current workers; rollback was not started." >&2; exit 1
}
retain_release_lock
if ! API_IMAGE="$api_image" WEB_IMAGE="$web_image" IMAGE_TAG="$image_tag" docker compose --env-file "$env_file" -f "$compose_file" stop --timeout -1 worker; then
  printf '%s\n' "Worker drain outcome is uncertain; rollback was not started. Inspect the worker and retained lock." >&2
  exit 1
fi
require_clean_worker_exit "$stopping_worker_ids"
require_unambiguous_continuations
API_IMAGE="$api_image" WEB_IMAGE="$web_image" IMAGE_TAG="$image_tag" docker compose --env-file "$env_file" -f "$compose_file" up -d api worker web
APP_DIR="$app_dir" "$app_dir/infra/scripts/healthcheck.sh"
require_target_worker
release_lock_when_safe
API_IMAGE="$api_image" WEB_IMAGE="$web_image" IMAGE_TAG="$image_tag" docker compose --env-file "$env_file" -f "$compose_file" ps

