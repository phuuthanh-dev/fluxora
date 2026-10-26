#!/usr/bin/env sh
set -eu

app_dir="${APP_DIR:-/opt/workflow-automation}"
min_free_kb="${MIN_FREE_KB:-2097152}"

case "$min_free_kb" in
  ''|*[!0-9]*)
    printf '%s\n' "MIN_FREE_KB must be a non-negative integer" >&2
    exit 1
    ;;
esac

available_kb="$(LC_ALL=C df -Pk "$app_dir" | awk 'NR == 2 {print $4}')"
case "$available_kb" in
  ''|*[!0-9]*)
    printf '%s\n' "Could not determine available disk space for: $app_dir" >&2
    exit 1
    ;;
esac

if [ "$available_kb" -lt "$min_free_kb" ]; then
  printf '%s\n' "Insufficient disk space: ${available_kb} KiB available, ${min_free_kb} KiB required" >&2
  exit 1
fi

printf '%s\n' "Disk preflight passed: ${available_kb} KiB available"
