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

# `pg_restore --clean` only removes objects present in the archive. Refuse a
# populated target rather than silently leaving post-snapshot objects behind.
# This is a conservative catalog check, not a fence against unmanaged writers
# or proof of equivalence for every possible PostgreSQL object.
target_state="$(docker compose --env-file "$env_file" -f "$compose_file" exec -T db \
  sh -c 'psql -X --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" --no-align --tuples-only --set ON_ERROR_STOP=1 -c "
    SELECT CASE WHEN
      EXISTS (SELECT 1 FROM pg_namespace WHERE nspname <> '\''public'\'' AND nspname <> '\''information_schema'\'' AND nspname !~ '\''^pg_'\'')
      OR EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = '\''public'\'')
      OR EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = '\''public'\'')
      OR EXISTS (SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace WHERE n.nspname = '\''public'\'')
      OR EXISTS (SELECT 1 FROM pg_extension WHERE extname <> '\''plpgsql'\'')
      OR EXISTS (SELECT 1 FROM pg_largeobject_metadata)
      OR EXISTS (SELECT 1 FROM pg_publication)
      OR EXISTS (SELECT 1 FROM pg_subscription)
    THEN '\''populated'\'' ELSE '\''clear'\'' END"'
)" || {
  printf '%s\n' "Could not inspect the restore target; restore was not started." >&2
  exit 1
}
if [ "$target_state" != clear ]; then
  printf '%s\n' "Restore target is not clear; use a separate empty database and reconcile writes. No restore was started." >&2
  exit 1
fi

# A lost client connection can leave the outcome of COMMIT uncertain. Keep
# the shared lock on any failure or interruption until an operator inspects it.
retain_release_lock
docker compose --env-file "$env_file" -f "$compose_file" exec -T db \
  sh -c 'pg_restore --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" --clean --if-exists --no-owner --no-acl --exit-on-error --single-transaction' \
  < "$backup_file"

release_lock_when_safe
printf '%s\n' "PostgreSQL archive restored from: $backup_file; independently verify schema, data, key and queue before use."
