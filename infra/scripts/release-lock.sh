#!/usr/bin/env sh
# Shared by deployment and rollback. A stale lock is never removed
# automatically: the operator must first verify that no release is running.
acquire_release_lock() {
  release_lock_dir="$1/.fluxora-release.lock"
  if ! mkdir "$release_lock_dir" 2>/dev/null; then
    printf '%s\n' "Another release holds the lock, or the lock needs inspection; no services were changed." >&2
    return 1
  fi
  release_lock_retained=0
  trap 'if [ "$release_lock_retained" = 0 ]; then rmdir "$release_lock_dir" 2>/dev/null || true; else printf "%s\n" "Release state is uncertain; lock retained for inspection." >&2; fi' EXIT
  trap 'exit 1' HUP INT TERM
}

retain_release_lock() { release_lock_retained=1; }
release_lock_when_safe() { release_lock_retained=0; }

# Check containers' actual immutable image IDs, not their mutable tags.
require_compatible_fleet() {
  fleet_ids=""
  for service in api worker; do
    service_ids="$(API_IMAGE="$api_image" WEB_IMAGE="$web_image" IMAGE_TAG="$image_tag" \
      docker compose --env-file "$env_file" -f "$compose_file" ps -aq "$service")" || {
      printf '%s\n' "Cannot inspect the current fleet; deployment was not started." >&2; return 1
    }
    if [ -z "$service_ids" ]; then
      printf '%s\n' "API or worker containers were not found; fleet compatibility cannot be established." >&2; return 1
    fi
    fleet_ids="$fleet_ids $service_ids"
  done
  for container_id in $fleet_ids; do
    container_state="$(docker inspect --format '{{.State.Status}}' "$container_id")" || {
      printf '%s\n' "Cannot inspect a current container; deployment was not started." >&2; return 1
    }
    case "$container_state" in
      running|paused|restarting|exited|created|dead) ;;
      *) printf '%s\n' "Unexpected container state; deployment was not started." >&2; return 1 ;;
    esac
    current_image="$(docker inspect --format '{{.Image}}' "$container_id")" || {
      printf '%s\n' "Cannot inspect a current image; deployment was not started." >&2; return 1
    }
    current_compatibility="$(docker image inspect --format '{{ index .Config.Labels "io.fluxora.execution-compatibility" }}' "$current_image")" || {
      printf '%s\n' "Cannot inspect current API compatibility; deployment was not started." >&2; return 1
    }
    if [ "$current_compatibility" != nx-v1 ]; then
      printf '%s\n' "An incompatible API or worker container exists; complete the verified cutover before deployment." >&2; return 1
    fi
  done
}

# Docker stop may succeed even when the process exits with an error. Check the
# same containers observed before stopping; uncertain outcomes keep the lock.
require_clean_worker_exit() {
  for stopped_worker_id in $1; do
    stopped_worker_state="$(docker inspect --format '{{.State.Status}} {{.State.ExitCode}} {{.State.OOMKilled}}' "$stopped_worker_id")" || {
      printf '%s\n' "Cannot inspect stopped worker; release remains locked." >&2; return 1
    }
    if [ "$stopped_worker_state" != 'exited 0 false' ]; then
      printf '%s\n' "Worker did not exit cleanly; inspect execution state and retained lock." >&2; return 1
    fi
  done
}

# Legacy approval continuations have no durable nonce. A queued, already
# started execution without a well-formed nonce needs investigation.
# JSON conversion also works on schemas before the resumeToken column existed.
require_unambiguous_continuations() {
  legacy_pending_sql="SELECT CASE WHEN EXISTS (SELECT 1 FROM \"Execution\" e WHERE e.status = 'QUEUED' AND e.\"startedAt\" IS NOT NULL AND COALESCE(to_jsonb(e)->>'resumeToken', '') !~ '^[0-9a-f]{48}$') THEN 'ambiguous' ELSE 'clear' END"
  legacy_pending="$(API_IMAGE="$api_image" WEB_IMAGE="$web_image" IMAGE_TAG="$image_tag" \
    docker compose --env-file "$env_file" -f "$compose_file" exec -T db \
    sh -c 'exec psql -X -qAt -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" -c "$1"' sh "$legacy_pending_sql")" || {
    printf '%s\n' "Cannot inspect legacy continuations; release cannot proceed." >&2; return 1
  }
  if [ "$legacy_pending" != clear ]; then
    printf '%s\n' "Ambiguous legacy queued execution or unexpected database result; inspect the queue." >&2; return 1
  fi
}

# Health endpoints do not establish that a queue consumer actually started.
require_target_worker() {
  target_image_id="$(docker image inspect --format '{{.Id}}' "$api_image:$image_tag")" || {
    printf '%s\n' "Could not inspect the replacement image." >&2; return 1
  }
  if [ -z "$target_image_id" ]; then
    printf '%s\n' "Replacement image has no inspectable ID." >&2; return 1
  fi
  worker_ids="$(API_IMAGE="$api_image" WEB_IMAGE="$web_image" IMAGE_TAG="$image_tag" \
    docker compose --env-file "$env_file" -f "$compose_file" ps -q worker)" || {
    printf '%s\n' "Could not inspect the replacement worker." >&2; return 1;
  }
  if [ -z "$worker_ids" ]; then
    printf '%s\n' "No replacement worker is running." >&2; return 1
  fi
  for worker_id in $worker_ids; do
    worker_state="$(docker inspect --format '{{.State.Status}}' "$worker_id")" || return 1
    worker_image="$(docker inspect --format '{{.Config.Image}}' "$worker_id")" || return 1
    worker_image_id="$(docker inspect --format '{{.Image}}' "$worker_id")" || return 1
    if [ "$worker_state" != running ] || [ "$worker_image" != "$api_image:$image_tag" ] || [ "$worker_image_id" != "$target_image_id" ]; then
      printf '%s\n' "Replacement worker is not running the requested image." >&2; return 1
    fi
  done
}
