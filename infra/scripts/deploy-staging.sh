#!/usr/bin/env sh
set -eu

app_dir="${APP_DIR:-/opt/workflow-automation}"
env_file="${ENV_FILE:-$app_dir/.env.staging}"
base_compose="$app_dir/infra/docker-compose.production.yml"
staging_compose="$app_dir/infra/docker-compose.staging.yml"
image_tag="${IMAGE_TAG:-}"
api_image="${API_IMAGE:-ghcr.io/phuuthanh-dev/workflow-automation-api}"
web_image="${WEB_IMAGE:-ghcr.io/phuuthanh-dev/workflow-automation-web}"
previous_api_image_tag=""
previous_web_image_tag=""

if [ ! -f "$env_file" ]; then
  printf '%s\n' "Missing staging env file: $env_file" >&2
  exit 1
fi

if [ ! -f "$base_compose" ] || [ ! -f "$staging_compose" ]; then
  printf '%s\n' "Missing staging Compose files under: $app_dir/infra" >&2
  exit 1
fi

"$app_dir/infra/scripts/validate-image-tag.sh" "$image_tag" >/dev/null
APP_DIR="$app_dir" "$app_dir/infra/scripts/check-disk-space.sh"

api_container_id="$(API_IMAGE="$api_image" WEB_IMAGE="$web_image" IMAGE_TAG="$image_tag" \
  docker compose --project-name workflow-automation-staging --env-file "$env_file" \
  -f "$base_compose" -f "$staging_compose" ps -q api 2>/dev/null || true)"
if [ -n "$api_container_id" ]; then
  previous_api_image="$(docker inspect --format '{{.Config.Image}}' "$api_container_id" 2>/dev/null || true)"
  case "$previous_api_image" in
    "$api_image":*) previous_api_image_tag="${previous_api_image#"$api_image:"}" ;;
  esac
fi

web_container_id="$(API_IMAGE="$api_image" WEB_IMAGE="$web_image" IMAGE_TAG="$image_tag" \
  docker compose --project-name workflow-automation-staging --env-file "$env_file" \
  -f "$base_compose" -f "$staging_compose" ps -q web 2>/dev/null || true)"
if [ -n "$web_container_id" ]; then
  previous_web_image="$(docker inspect --format '{{.Config.Image}}' "$web_container_id" 2>/dev/null || true)"
  case "$previous_web_image" in
    "$web_image":*) previous_web_image_tag="${previous_web_image#"$web_image:"}" ;;
  esac
fi

API_IMAGE="$api_image" WEB_IMAGE="$web_image" IMAGE_TAG="$image_tag" \
docker compose --project-name workflow-automation-staging --env-file "$env_file" \
  -f "$base_compose" -f "$staging_compose" pull migrate api worker web
API_IMAGE="$api_image" WEB_IMAGE="$web_image" IMAGE_TAG="$image_tag" \
docker compose --project-name workflow-automation-staging --env-file "$env_file" \
  -f "$base_compose" -f "$staging_compose" up -d --remove-orphans db redis migrate
API_IMAGE="$api_image" WEB_IMAGE="$web_image" IMAGE_TAG="$image_tag" \
docker compose --project-name workflow-automation-staging --env-file "$env_file" \
  -f "$base_compose" -f "$staging_compose" up -d --remove-orphans api worker web

APP_DIR="$app_dir" "$app_dir/infra/scripts/healthcheck.sh"
API_IMAGE="$api_image" WEB_IMAGE="$web_image" IMAGE_TAG="$image_tag" \
PREVIOUS_API_IMAGE_TAG="$previous_api_image_tag" PREVIOUS_WEB_IMAGE_TAG="$previous_web_image_tag" \
  "$app_dir/infra/scripts/prune-application-images.sh"
API_IMAGE="$api_image" WEB_IMAGE="$web_image" IMAGE_TAG="$image_tag" \
docker compose --project-name workflow-automation-staging --env-file "$env_file" \
  -f "$base_compose" -f "$staging_compose" ps
