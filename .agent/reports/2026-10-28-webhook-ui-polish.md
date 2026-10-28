# Webhook UI polish

The resource picker now separates its search, select and manual entry controls, with a compact manual-entry link. GitHub and generic webhook nodes expose setup in context. When a draft node differs from the published trigger, the inspector explicitly identifies that the panel manages the published trigger. Multiple draft triggers cannot lead to a misleading setup shortcut. The setup panel retains the published-version boundary and is accessible above the narrow editor inspector.

Local validation: `npm run verify` passed, including 168 API tests, 19 web tests and 38 Playwright tests. The focused webhook suite passed eight tests, including the multiple-draft-trigger case. Light/dark and narrow editor were inspected using mocked data before the final small-text size adjustment. Local pending migrations were applied to fix the local endpoint status error. No live provider webhook was created or rotated.

The node opens the existing setup panel; GitHub registration remains manual. n8n's GitHub trigger creates a repository hook using the credential ([source](https://github.com/n8n-io/n8n/blob/master/packages/nodes-base/nodes/Github/GithubTrigger.node.ts)); n8n and Zapier display webhook URLs in the trigger ([n8n](https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.webhook/), [Zapier](https://help.zapier.com/hc/en-us/articles/8496288690317-Trigger-Zap-workflows-from-webhooks)).

PR #31 was merged and deployed as `16d53a5ee6b0ef19bfc26383a551f080c4b8ac36`. Quality gate run 40642616129 and production deployment run 40642994157 succeeded. On 2026-10-28, the public website returned HTTP 200 and API readiness reported database and Redis ready.

An owner-approved live GitHub Push qualification used `phuuthanh-dev/math-util`, a dedicated workflow, endpoint and repository webhook. GitHub's signed ping and branch-creation push both returned HTTP 201; the corresponding workflow v1 live execution succeeded. The test workflow and GitHub webhook were deactivated after testing; the test branch and execution history remain. This is one successful trigger-only run, not evidence for GitHub action nodes or sustained production stability.
