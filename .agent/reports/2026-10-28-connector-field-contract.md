# Connector field contract parity

The connector audit confirmed that GitHub's resource-picker and webhook model
should not be copied to every provider. Drive and Sheets use one node with an
operation selector; notification providers use separate action nodes backed by
shared adapters; Steam and Telegram retain bespoke controls only for provider
specific identity/destination semantics; HTTP remains a generic manual target;
roadmap nodes remain unavailable.

Steam's simple credential, Steam ID, boolean data-scope, and achievement fields
now use the shared inspector field metadata. This removes a duplicate rendering
branch without changing node type names, defaults, saved graph keys, or runtime
behavior. Telegram destination guidance and approval/webhook lifecycle controls
remain bespoke intentionally.

Focused web tests passed: 20 tests; web typecheck passed. The final full gate
passed with 168 API tests, 20 web tests, and 39 Playwright tests, including the
Steam onboarding/publish flow. No provider calls, credential reads, migrations,
deployment, or external writes were performed. The first full-gate attempt was
discarded because it reused a stale local API process and returned an unrelated
publish 500; restarting the local processes and rerunning the focused and full
gate removed that environmental false negative.
