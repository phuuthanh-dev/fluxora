#!/usr/bin/env sh
set -eu

app_dir="${APP_DIR:-/opt/workflow-automation}"
env_file="${ENV_FILE:-$app_dir/.env.production}"
compose_file="$app_dir/infra/docker-compose.production.yml"
backup_dir="${BACKUP_DIR:-$app_dir/backups}"
timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
backup_file="${BACKUP_FILE:-$backup_dir/postgres-$timestamp.dump}"

if [ ! -f "$env_file" ] || [ ! -f "$compose_file" ]; then
  printf '%s\n' "Production environment or Compose contract is missing." >&2
  exit 1
fi

mkdir -p "$backup_dir"
umask 077

docker compose --env-file "$env_file" -f "$compose_file" exec -T db \
  sh -c 'pg_dump --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" --format=custom --no-owner --no-acl' \
  > "$backup_file"

chmod 600 "$backup_file"
printf '%s\n' "PostgreSQL backup created: $backup_file"
