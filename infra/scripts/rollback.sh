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

IMAGE_TAG="$image_tag" docker compose --env-file "$env_file" -f "$compose_file" pull
IMAGE_TAG="$image_tag" docker compose --env-file "$env_file" -f "$compose_file" up -d api worker web
APP_DIR="$app_dir" "$app_dir/infra/scripts/healthcheck.sh"
IMAGE_TAG="$image_tag" docker compose --env-file "$env_file" -f "$compose_file" ps

