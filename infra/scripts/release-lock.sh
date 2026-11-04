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
    current_drain="$(docker image inspect --format '{{ index .Config.Labels "io.fluxora.graceful-drain" }}' "$current_image")" || {
      printf '%s\n' "Cannot inspect current drain support; deployment was not started." >&2; return 1
    }
    if [ "$current_drain" != v1 ]; then
      printf '%s\n' "An API or worker image lacks the required graceful drain contract." >&2; return 1
    fi
  done
}

# The owner may explicitly authorize one first transition from a specific
# immutable legacy image. The check is intentionally narrow: one running API
# and one running worker, both from that exact image, with the default local
# Redis queue. Unrecognized topology must use a separately reviewed procedure.
require_legacy_first_cutover_fleet() {
  legacy_image_id="${FLUXORA_LEGACY_CUTOVER_IMAGE_ID:-}"
  case "$legacy_image_id" in sha256:*) legacy_hash="${legacy_image_id#sha256:}" ;; *) printf '%s\n' "A full legacy image ID is required." >&2; return 1 ;; esac
  case "$legacy_hash" in *[!0-9a-f]*|'') printf '%s\n' "Invalid legacy image ID." >&2; return 1 ;; esac
  if [ "${#legacy_hash}" -ne 64 ]; then printf '%s\n' "Invalid legacy image ID." >&2; return 1; fi
  for legacy_service in api worker; do
    legacy_ids="$(docker compose --env-file "$env_file" -f "$compose_file" ps -aq "$legacy_service")" || return 1
    set -- $legacy_ids
    if [ "$#" -ne 1 ]; then printf '%s\n' "First cutover requires exactly one API and one worker." >&2; return 1; fi
    legacy_id="$1"
    case "$legacy_service" in api) legacy_api_id="$legacy_id" ;; worker) legacy_worker_id="$legacy_id" ;; esac
    legacy_actual="$(docker inspect --format '{{.Image}}' "$legacy_id")" || return 1
    legacy_status="$(docker inspect --format '{{.State.Status}}' "$legacy_id")" || return 1
    if [ "$legacy_actual" != "$legacy_image_id" ] || [ "$legacy_status" != running ]; then
      printf '%s\n' "Legacy fleet image or state changed; cutover was not started." >&2; return 1
    fi
    # Emit no connection string, token or environment value.
    if ! docker exec "$legacy_id" node -e 'try { const u = new URL(process.env.REDIS_URL || ""); if (process.env.EXECUTION_QUEUE_MODE !== "redis" || (process.env.EXECUTION_QUEUE_NAME || "workflow-executions") !== "workflow-executions" || u.protocol !== "redis:" || u.hostname !== "redis" || (u.port && u.port !== "6379") || !["", "/", "/0"].includes(u.pathname) || u.username || u.password || u.search || u.hash) process.exit(1); } catch { process.exit(1); }'; then
      printf '%s\n' "First cutover requires the expected local Redis queue configuration." >&2; return 1
    fi
  done
}

require_legacy_database() {
  legacy_schema_sql="SELECT CASE WHEN EXISTS (SELECT 1 FROM \"_prisma_migrations\" WHERE migration_name IN ('20261103120000_kuma_delivery_digest', '20261103130000_rss_trigger_checkpoint', '20261103140000_approval_continuation', '20261103150000_execution_run_token') OR (finished_at IS NULL AND rolled_back_at IS NULL)) THEN 'unsafe' ELSE 'legacy' END"
  legacy_schema_state="$(docker compose --env-file "$env_file" -f "$compose_file" exec -T db sh -c 'exec psql -X -qAt -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" -c "$1"' sh "$legacy_schema_sql")" || return 1
  if [ "$legacy_schema_state" != legacy ]; then printf '%s\n' "Database is not a verified legacy schema; first cutover stopped." >&2; return 1; fi
}

require_legacy_quiescent() {
  legacy_idle_sql="SELECT CASE WHEN EXISTS (SELECT 1 FROM \"Execution\" WHERE status IN ('QUEUED', 'RUNNING', 'WAITING_APPROVAL')) OR EXISTS (SELECT 1 FROM \"ApprovalRequest\" WHERE status = 'PENDING') THEN 'busy' ELSE 'clear' END"
  legacy_idle_state="$(docker compose --env-file "$env_file" -f "$compose_file" exec -T db sh -c 'exec psql -X -qAt -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" -c "$1"' sh "$legacy_idle_sql")" || return 1
  if [ "$legacy_idle_state" != clear ]; then printf '%s\n' "Legacy executions or approvals require review before cutover." >&2; return 1; fi
  legacy_queue_state="$(docker compose --env-file "$env_file" -f "$compose_file" exec -T redis redis-cli --raw EVAL 'return redis.call("LLEN",KEYS[1])+redis.call("LLEN",KEYS[2])+redis.call("LLEN",KEYS[3])+redis.call("ZCARD",KEYS[4])+redis.call("ZCARD",KEYS[5])+redis.call("ZCARD",KEYS[6])+redis.call("ZCARD",KEYS[7])' 7 bull:workflow-executions:wait bull:workflow-executions:active bull:workflow-executions:paused bull:workflow-executions:delayed bull:workflow-executions:prioritized bull:workflow-executions:waiting-children bull:workflow-executions:repeat)" || return 1
  if [ "$legacy_queue_state" != 0 ]; then printf '%s\n' "Legacy queue has pending or uninspectable work; cutover stopped." >&2; return 1; fi
}

require_legacy_api_exit() {
  for stopped_api_id in $1; do
    stopped_api_state="$(docker inspect --format '{{.State.Status}} {{.State.ExitCode}} {{.State.OOMKilled}}' "$stopped_api_id")" || return 1
    case "$stopped_api_state" in 'exited 0 false'|'exited 143 false') ;; *) printf '%s\n' "Legacy API stop is uncertain; release remains locked." >&2; return 1 ;; esac
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

# The API must finish accepted requests and its scheduler scans before any
# migration. An uncertain exit is not evidence that provider work completed.
require_clean_api_exit() {
  for stopped_api_id in $1; do
    stopped_api_state="$(docker inspect --format '{{.State.Status}} {{.State.ExitCode}} {{.State.OOMKilled}}' "$stopped_api_id")" || {
      printf '%s\n' "Cannot inspect stopped API; release remains locked." >&2; return 1
    }
    if [ "$stopped_api_state" != 'exited 0 false' ]; then
      printf '%s\n' "API did not exit cleanly; inspect request and scheduler state and retained lock." >&2; return 1
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

# Call only after all known producers and workers have drained. A RUNNING row
# at that point may belong to a crashed or unmanaged worker; do not guess its
# provider outcome or let the new API's lease maintenance change it silently.
require_no_running_executions() {
  running_execution_sql="SELECT CASE WHEN EXISTS (SELECT 1 FROM \"Execution\" WHERE status = 'RUNNING') THEN 'running' ELSE 'clear' END"
  running_execution_state="$(API_IMAGE="$api_image" WEB_IMAGE="$web_image" IMAGE_TAG="$image_tag" \
    docker compose --env-file "$env_file" -f "$compose_file" exec -T db \
    sh -c 'exec psql -X -qAt -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" -c "$1"' sh "$running_execution_sql")" || {
    printf '%s\n' "Cannot inspect running executions; release remains locked." >&2; return 1
  }
  if [ "$running_execution_state" != clear ]; then
    printf '%s\n' "Execution still marked RUNNING after drain, or unexpected database result; inspect execution and provider state." >&2; return 1
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

# A successful health response could come from a stale API container. Verify
# every running Compose API against the immutable target image as well.
require_target_api() {
  target_api_image_id="$(docker image inspect --format '{{.Id}}' "$api_image:$image_tag")" || {
    printf '%s\n' "Could not inspect the replacement API image." >&2; return 1
  }
  if [ -z "$target_api_image_id" ]; then
    printf '%s\n' "Replacement API image has no inspectable ID." >&2; return 1
  fi
  target_api_ids="$(API_IMAGE="$api_image" WEB_IMAGE="$web_image" IMAGE_TAG="$image_tag" \
    docker compose --env-file "$env_file" -f "$compose_file" ps -q api)" || {
    printf '%s\n' "Could not inspect the replacement API." >&2; return 1
  }
  if [ -z "$target_api_ids" ]; then
    printf '%s\n' "No replacement API is running." >&2; return 1
  fi
  for target_api_id in $target_api_ids; do
    target_api_state="$(docker inspect --format '{{.State.Status}}' "$target_api_id")" || return 1
    target_api_image="$(docker inspect --format '{{.Config.Image}}' "$target_api_id")" || return 1
    target_api_actual_id="$(docker inspect --format '{{.Image}}' "$target_api_id")" || return 1
    if [ "$target_api_state" != running ] || [ "$target_api_image" != "$api_image:$image_tag" ] || [ "$target_api_actual_id" != "$target_api_image_id" ]; then
      printf '%s\n' "Replacement API is not running the requested image." >&2; return 1
    fi
  done
}
