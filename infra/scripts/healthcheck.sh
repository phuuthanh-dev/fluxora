#!/usr/bin/env sh
set -eu

api_url="${API_HEALTH_URL:-http://127.0.0.1:3001/api/v1/health}"
web_url="${WEB_HEALTH_URL:-http://127.0.0.1:3000/}"
retries="${HEALTHCHECK_RETRIES:-30}"
delay_seconds="${HEALTHCHECK_DELAY_SECONDS:-2}"

check_url() {
  url="$1"
  attempt=1

  while [ "$attempt" -le "$retries" ]; do
    if curl --fail --silent --show-error --connect-timeout 2 --max-time 10 "$url" >/dev/null; then
      return 0
    fi

    if [ "$attempt" -lt "$retries" ]; then
      sleep "$delay_seconds"
    fi
    attempt=$((attempt + 1))
  done

  printf '%s\n' "health check failed after $retries attempts: $url" >&2
  return 1
}

check_url "$api_url"
check_url "$web_url"
printf '%s\n' "workflow-automation health check passed"

