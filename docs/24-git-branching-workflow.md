# Git branching workflow

Fluxora uses a two-branch remote workflow:

- `main` is the production branch.
- `develop` is the only integration branch published on GitHub.

Daily implementation stays local. Create a short-lived local branch from
`develop`, commit work there, and merge it into local `develop` after focused
checks. Push only `develop` when the integration branch is ready. The only
production pull request is `develop` → `main`.

```text
local task branch → local develop → origin/develop → PR → main
```

Before publishing `develop`, run `npm run verify` and inspect `git status`.
Do not push local task branches with `git push --all`, and do not create PRs
from task branches. Remote branch cleanup is intentional: GitHub keeps only
`main` and `develop`; local task branches may remain as recoverable history.

If a task branch needs to be shared, merge it into local `develop` first and
share the `develop` branch or the resulting `develop` → `main` pull request.
