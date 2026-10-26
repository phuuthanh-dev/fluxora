#!/usr/bin/env sh
set -eu

owner="${GHCR_OWNER:-${GITHUB_REPOSITORY_OWNER:-}}"
package_name="${GHCR_PACKAGE_NAME:-}"
keep_versions="${GHCR_KEEP_VERSIONS:-5}"
dry_run="${DRY_RUN:-false}"

if [ -z "$owner" ] || [ -z "$package_name" ]; then
  printf '%s\n' "GHCR_OWNER and GHCR_PACKAGE_NAME are required" >&2
  exit 1
fi

case "$keep_versions" in
  ''|*[!0-9]*)
    printf '%s\n' "GHCR_KEEP_VERSIONS must be a non-negative integer" >&2
    exit 1
    ;;
esac

case "$dry_run" in
  true|false) ;;
  *)
    printf '%s\n' "DRY_RUN must be true or false" >&2
    exit 1
    ;;
esac

if [ -z "${GH_TOKEN:-}" ]; then
  printf '%s\n' "GH_TOKEN is required" >&2
  exit 1
fi

endpoint="/users/${owner}/packages/container/${package_name}/versions?per_page=100"
version_ids="$(gh api --paginate --slurp "$endpoint" | jq -r --argjson keep "$keep_versions" '
  add
  | map(select((.metadata.container.tags // []) as $tags
      | ($tags | length) > 0
      and ($tags | all(test("^[0-9a-f]{40}$")))))
  | sort_by(.created_at)
  | reverse
  | .[$keep:][]?.id
')"

if [ -z "$version_ids" ]; then
  printf '%s\n' "No old immutable versions to prune for ${package_name}"
  exit 0
fi

printf '%s\n' "$version_ids" | while IFS= read -r version_id; do
  [ -n "$version_id" ] || continue
  if [ "$dry_run" = "true" ]; then
    printf '%s\n' "Would delete GHCR package version ${version_id} from ${package_name}"
  else
    gh api --method DELETE "/users/${owner}/packages/container/${package_name}/versions/${version_id}"
    printf '%s\n' "Deleted GHCR package version ${version_id} from ${package_name}"
  fi
done
