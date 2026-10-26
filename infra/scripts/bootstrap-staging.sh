#!/usr/bin/env sh
set -eu

app_dir="${APP_DIR:-/opt/workflow-automation}"
env_file="$app_dir/.env.staging"

if [ -e "$env_file" ]; then
  printf '%s\n' "Refusing to overwrite existing staging env: $env_file" >&2
  exit 1
fi

postgres_password="$(openssl rand -hex 24)"
jwt_access_secret="$(openssl rand -hex 32)"
jwt_refresh_secret="$(openssl rand -hex 32)"
app_encryption_key="$(openssl rand -base64 32 | tr -d '\n')"

umask 077
{
  printf '%s\n' \
    'POSTGRES_USER=workflow' \
    'POSTGRES_DB=workflow' \
    'IMAGE_TAG=staging' \
    'API_IMAGE=workflow-automation-api' \
    'WEB_IMAGE=workflow-automation-web' \
    'NODE_ENV=staging' \
    'NEXT_PUBLIC_API_URL=http://103.140.249.73/api/v1' \
    'WEB_ORIGIN=http://103.140.249.73' \
    'EXECUTION_QUEUE_MODE=redis' \
    'EXECUTION_WORKER_CONCURRENCY=2' \
    'SCHEDULER_ENABLED=true' \
    'EXECUTION_MAINTENANCE_ENABLED=true' \
    'EXECUTION_RETENTION_SUCCESS_DAYS=14' \
    'EXECUTION_RETENTION_FAILED_DAYS=30' \
    'EXECUTION_RETENTION_MAX_COUNT=10000'
  printf 'POSTGRES_PASSWORD=%s\n' "$postgres_password"
  printf 'JWT_ACCESS_SECRET=%s\n' "$jwt_access_secret"
  printf 'JWT_REFRESH_SECRET=%s\n' "$jwt_refresh_secret"
  printf 'APP_ENCRYPTION_KEY=%s\n' "$app_encryption_key"
  printf '%s\n' \
    'GOOGLE_CLIENT_ID=' \
    'GOOGLE_CLIENT_SECRET=' \
    'GOOGLE_REDIRECT_URI=' \
    'GOOGLE_AUTH_REDIRECT_URI=' \
    'GITHUB_CLIENT_ID=' \
    'GITHUB_CLIENT_SECRET=' \
    'GITHUB_AUTH_REDIRECT_URI=' \
    'STEAM_OPENID_RETURN_URI=' \
    'STEAM_OPENID_REALM='
} > "$env_file"

cp "$env_file" "$app_dir/.env.production"
chmod 600 "$env_file" "$app_dir/.env.production"
printf '%s\n' "Created staging env at $env_file without displaying secrets."

