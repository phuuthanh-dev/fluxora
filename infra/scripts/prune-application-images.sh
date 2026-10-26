#!/usr/bin/env sh
set -eu

script_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
api_image="${API_IMAGE:-}"
web_image="${WEB_IMAGE:-}"
current_tag="${IMAGE_TAG:-}"
previous_api_tag="${PREVIOUS_API_IMAGE_TAG:-}"
previous_web_tag="${PREVIOUS_WEB_IMAGE_TAG:-}"

if [ -z "$api_image" ] || [ -z "$web_image" ] || [ -z "$current_tag" ]; then
  printf '%s\n' "API_IMAGE, WEB_IMAGE, and IMAGE_TAG are required" >&2
  exit 1
fi

validate_tag() {
  "$script_dir/validate-image-tag.sh" "$1" >/dev/null 2>&1
}

prune_repository() {
  repository="$1"
  previous_tag="$2"

  docker image ls "$repository" --format '{{.Repository}}:{{.Tag}}' | while IFS= read -r image_ref; do
    [ -n "$image_ref" ] || continue
    tag="${image_ref##*:}"

    # Only remove immutable commit-SHA tags. Never touch mutable tags or images
    # outside the two application repositories passed to this script.
    validate_tag "$tag" || continue
    [ "$tag" = "$current_tag" ] && continue
    [ -n "$previous_tag" ] && [ "$tag" = "$previous_tag" ] && continue

    printf '%s\n' "Removing old application image: $image_ref"
    if ! docker image rm "$image_ref" >/dev/null 2>&1; then
      printf '%s\n' "Skipping image still referenced by another container: $image_ref" >&2
    fi
  done
}

prune_repository "$api_image" "$previous_api_tag"
prune_repository "$web_image" "$previous_web_tag"
