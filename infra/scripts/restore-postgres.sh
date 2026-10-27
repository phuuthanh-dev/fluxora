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

docker compose --env-file "$env_file" -f "$compose_file" exec -T db \
  sh -c 'pg_restore --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" --clean --if-exists --no-owner --no-acl --exit-on-error' \
  < "$backup_file"

printf '%s\n' "PostgreSQL restore completed from: $backup_file"
