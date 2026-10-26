#!/usr/bin/env sh
set -eu

app_dir="${APP_DIR:-/opt/workflow-automation}"
env_file="${ENV_FILE:-$app_dir/.env.production}"
compose_file="$app_dir/infra/docker-compose.production.yml"
image_tag="${IMAGE_TAG:-}"

if [ ! -f "$env_file" ]; then
  printf '%s\n' "Missing production env file: $env_file" >&2
  exit 1
fi

if [ ! -f "$compose_file" ]; then
  printf '%s\n' "Missing compose file: $compose_file" >&2
  exit 1
fi

"$app_dir/infra/scripts/validate-image-tag.sh" "$image_tag" >/dev/null

docker compose --env-file "$env_file" -f "$compose_file" pull
docker compose --env-file "$env_file" -f "$compose_file" up -d db redis migrate
docker compose --env-file "$env_file" -f "$compose_file" up -d api worker web

APP_DIR="$app_dir" "$app_dir/infra/scripts/healthcheck.sh"
docker compose --env-file "$env_file" -f "$compose_file" ps

