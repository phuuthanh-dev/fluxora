#!/usr/bin/env sh
set -eu

if [ "${CONFIRM_RESTORE:-}" != "RESTORE" ]; then
  printf '%s\n' "Restore is destructive. Set CONFIRM_RESTORE=RESTORE to continue." >&2
  exit 1
fi

if [ "$#" -ne 1 ]; then
  printf '%s\n' "Usage: CONFIRM_RESTORE=RESTORE $0 <backup.dump>" >&2
  exit 1
fi

backup_file="$1"
if [ ! -f "$backup_file" ]; then
  printf '%s\n' "Backup file does not exist: $backup_file" >&2
  exit 1
fi

app_dir="${APP_DIR:-/opt/workflow-automation}"
env_file="${ENV_FILE:-$app_dir/.env.production}"
compose_file="$app_dir/infra/docker-compose.production.yml"

if [ ! -f "$env_file" ] || [ ! -f "$compose_file" ]; then
  printf '%s\n' "Production environment or Compose contract is missing." >&2
  exit 1
fi

scripts_dir="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
. "$scripts_dir/release-lock.sh"
acquire_release_lock "$app_dir"

# Check every named Compose API and worker, including stopped containers.
# This does not discover unmanaged processes or tools that ignore the lock.
for service in api worker; do
  container_ids="$(docker compose --env-file "$env_file" -f "$compose_file" ps -aq "$service")" || {
    printf '%s\n' "Could not inspect application services; restore was not started." >&2
    exit 1
  }
  for container_id in $container_ids; do
    container_state="$(docker inspect --format '{{.State.Status}}' "$container_id")" || {
      printf '%s\n' "Could not inspect an application container; restore was not started." >&2
      exit 1
    }
    case "$container_state" in
      exited|created) ;;
      *) printf '%s\n' "Stop the API and workers before restoring; no restore was started." >&2; exit 1 ;;
    esac
  done
done

# A lost client connection can leave the outcome of COMMIT uncertain. Keep
# the shared lock on any failure or interruption until an operator inspects it.
retain_release_lock
docker compose --env-file "$env_file" -f "$compose_file" exec -T db \
  sh -c 'pg_restore --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" --clean --if-exists --no-owner --no-acl --exit-on-error --single-transaction' \
  < "$backup_file"

release_lock_when_safe
printf '%s\n' "PostgreSQL restore completed from: $backup_file"
