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

# Write into a uniquely created file in the destination directory. Publishing
# via a hard link is atomic and refuses to replace an existing backup.
# A failed or interrupted dump must not leave a partial file at the final path.
temporary_file="$(mktemp "${backup_file}.partial.XXXXXX")"
cleanup() { rm -f -- "$temporary_file"; }
trap cleanup EXIT
trap 'exit 1' HUP INT TERM

docker compose --env-file "$env_file" -f "$compose_file" exec -T db \
  sh -c 'pg_dump --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" --format=custom --no-owner --no-acl' \
  > "$temporary_file"

chmod 600 "$temporary_file"
if [ -e "$backup_file" ] || [ -L "$backup_file" ]; then
  printf '%s\n' "Backup destination already exists; refusing to overwrite it." >&2
  exit 1
fi
if ! ln "$temporary_file" "$backup_file"; then
  printf '%s\n' "Could not publish backup without overwriting an existing destination." >&2
  exit 1
fi
if [ ! -f "$backup_file" ]; then
  printf '%s\n' "Backup destination is not a file; inspect the destination before retrying." >&2
  exit 1
fi
printf '%s\n' "PostgreSQL backup created: $backup_file"
