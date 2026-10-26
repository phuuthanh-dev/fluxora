#!/usr/bin/env sh
set -eu

api_url="${API_HEALTH_URL:-http://127.0.0.1:3001/api/v1/health}"
web_url="${WEB_HEALTH_URL:-http://127.0.0.1:3000/}"

curl --fail --silent --show-error "$api_url" >/dev/null
curl --fail --silent --show-error "$web_url" >/dev/null
printf '%s\n' "workflow-automation health check passed"

