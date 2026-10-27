#!/usr/bin/env sh
set -eu

app_dir="${APP_DIR:-/opt/workflow-automation}"
env_file="${ENV_FILE:-$app_dir/.env.production}"
compose_file="$app_dir/infra/docker-compose.production.yml"
image_tag="${IMAGE_TAG:-}"
api_image="${API_IMAGE:-ghcr.io/phuuthanh-dev/workflow-automation-api}"
web_image="${WEB_IMAGE:-ghcr.io/phuuthanh-dev/workflow-automation-web}"
previous_api_image_tag=""
previous_web_image_tag=""

if [ ! -f "$env_file" ]; then
  printf '%s\n' "Missing production env file: $env_file" >&2
  exit 1
fi

if [ ! -f "$compose_file" ]; then
  printf '%s\n' "Missing compose file: $compose_file" >&2
  exit 1
fi

"$app_dir/infra/scripts/validate-image-tag.sh" "$image_tag" >/dev/null
APP_DIR="$app_dir" "$app_dir/infra/scripts/check-disk-space.sh"

api_container_id="$(API_IMAGE="$api_image" WEB_IMAGE="$web_image" IMAGE_TAG="$image_tag" \
  docker compose --env-file "$env_file" -f "$compose_file" ps -q api 2>/dev/null || true)"
if [ -n "$api_container_id" ]; then
  previous_api_image="$(docker inspect --format '{{.Config.Image}}' "$api_container_id" 2>/dev/null || true)"
  case "$previous_api_image" in
    "$api_image":*) previous_api_image_tag="${previous_api_image#"$api_image:"}" ;;
  esac
fi

web_container_id="$(API_IMAGE="$api_image" WEB_IMAGE="$web_image" IMAGE_TAG="$image_tag" \
  docker compose --env-file "$env_file" -f "$compose_file" ps -q web 2>/dev/null || true)"
if [ -n "$web_container_id" ]; then
  previous_web_image="$(docker inspect --format '{{.Config.Image}}' "$web_container_id" 2>/dev/null || true)"
  case "$previous_web_image" in
    "$web_image":*) previous_web_image_tag="${previous_web_image#"$web_image:"}" ;;
  esac
fi

docker compose --env-file "$env_file" -f "$compose_file" pull migrate api worker web
docker compose --env-file "$env_file" -f "$compose_file" up -d db redis
APP_DIR="$app_dir" ENV_FILE="$env_file" "$app_dir/infra/scripts/backup-postgres.sh"
docker compose --env-file "$env_file" -f "$compose_file" up -d migrate
docker compose --env-file "$env_file" -f "$compose_file" up -d api worker web

APP_DIR="$app_dir" "$app_dir/infra/scripts/healthcheck.sh"
API_IMAGE="$api_image" WEB_IMAGE="$web_image" IMAGE_TAG="$image_tag" \
PREVIOUS_API_IMAGE_TAG="$previous_api_image_tag" PREVIOUS_WEB_IMAGE_TAG="$previous_web_image_tag" \
  "$app_dir/infra/scripts/prune-application-images.sh"
docker compose --env-file "$env_file" -f "$compose_file" ps

