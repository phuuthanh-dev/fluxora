# Webhook UI polish

The resource picker now separates its search, select and manual entry controls, with a compact manual-entry link. GitHub and generic webhook nodes expose setup in context. When a draft node differs from the published trigger, the inspector explicitly identifies that the panel manages the published trigger. Multiple draft triggers cannot lead to a misleading setup shortcut. The setup panel retains the published-version boundary and is accessible above the narrow editor inspector.

Local validation: `npm run verify` passed, including 168 API tests, 19 web tests and 37 Playwright tests. The focused webhook suite passed seven tests. Light/dark and narrow editor were inspected using mocked data. Local pending migrations were applied to fix the local endpoint status error. No live provider webhook was created or rotated.

The node opens the existing setup panel; GitHub registration remains manual. n8n's GitHub trigger creates a repository hook using the credential ([source](https://github.com/n8n-io/n8n/blob/master/packages/nodes-base/nodes/Github/GithubTrigger.node.ts)); n8n and Zapier display webhook URLs in the trigger ([n8n](https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.webhook/), [Zapier](https://help.zapier.com/hc/en-us/articles/8496288690317-Trigger-Zap-workflows-from-webhooks)).

PR #30 was deployed as `41f325d0fab1e7982b874854a2e1c0a56650824d`, with healthy services and migrations applied. Live provider delivery after that deployment and sustained production stability remain unverified. This UI change has not been deployed.
