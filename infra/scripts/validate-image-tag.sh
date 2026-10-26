#!/usr/bin/env sh
set -eu

image_tag="${1:-${IMAGE_TAG:-}}"

case "$image_tag" in
  ''|*[!0-9a-f]*)
    printf '%s\n' "IMAGE_TAG must be a 40-character lowercase commit SHA; mutable tags are not allowed." >&2
    exit 1
    ;;
esac

if [ "${#image_tag}" -ne 40 ]; then
  printf '%s\n' "IMAGE_TAG must be a 40-character lowercase commit SHA; received ${#image_tag} characters." >&2
  exit 1
fi

printf '%s\n' "$image_tag"
