# payOS hosted checkout — preparation

A dedicated Fluxora payOS channel has been created. The existing Pet Love channel is independent. Checkout remains disabled by default (`PAYOS_CHECKOUT_ENABLED=false`): proposed plan quotas are not enforced and this integration has not been qualified with a real payment. Do not advertise or enable paid plans until the items below are complete.

The API prepares a fixed-price order on the server for the authenticated workspace owner, reserves an order before contacting payOS, and uses the official SDK without create retries. An uncertain create remains in REVIEW and requires reconciliation rather than issuing a second link. A signed webhook is checked against the stored order and payOS's authoritative payment status before recording a payment. Workspace locking and an order state check prevent duplicate delivery from adding paid time twice. The initial implementation grants 30 days with manual renewal; changing an active paid tier is blocked. Refunds, disputes, incomplete payments, abandoned links and ambiguous create failures require operator reconciliation; there is no automatic refund or recurring charge. Do not infer payment from the browser return URL. Never log provider credentials, full webhook data or checkout URLs.

Configuration is server-side: `PAYOS_CLIENT_ID`, `PAYOS_API_KEY`, and `PAYOS_CHECKSUM_KEY` from the **Fluxora** channel and `WEB_ORIGIN`. The endpoint is `/api/v1/billing/payos/webhook`. Leave secrets out of git, chat, screenshots and logs. Do not configure the provider webhook or turn on checkout on production until the endpoint is deployed and verified.

Before accepting payments:

- Specify and implement the promised plan entitlements and limits, billing/expiry/renewal, customer-facing terms, refund and support procedures. Current metering is incomplete for existing periods and cannot be used for charging.
- Review provider signature verification, concurrent checkout, duplicate/partial payments, cancelled/expired links, delayed webhooks, reconciliation and durable recovery. Qualify real payOS behavior, including the webhook registration challenge, using an explicitly authorized real payment; payOS has no separate sandbox.
- Configure the new channel credentials and webhook securely, apply the migration, and check logs and ownership isolation. Verify independent users, accessibility, mobile and both themes.
- Only then expose paid purchase and enable the flag; a flag alone is not evidence of production readiness.

References: [payOS payment links](https://payos.vn/docs/api/), [webhook signature](https://payos.vn/docs/tich-hop-webhook/kiem-tra-du-lieu-voi-signature/), [test environment](https://payos.vn/docs/moi-truong-test/).

Local validation on 2026-11-12: `npm run verify` passed using a disposable PostgreSQL database and separate web/API ports, including 255 Playwright cases. Desktop pricing, privacy, terms and support were inspected visually. The Fluxora channel exists and credentials were entered into local `.env`; production credentials and webhook are not configured by this change. This does not qualify real payment behavior or prove mobile visual quality.

## Paid-plan implementation in progress

The owner selected manual refund review through Support and blocking new live runs once the UTC-month allowance is exhausted. When `PLAN_LIMITS_ENABLED=true`, the execution start path locks its workspace, counts durable first-start records for that UTC month and records an explicit `PLAN_RUN_LIMIT` failure before any node runs. Approval continuations do not consume another run. Concurrency slots are reserved under the same workspace lock; capacity-delayed Redis jobs retry only before they begin execution. Workflow activation checks the active-workflow limit under that lock. Existing active workflows are not automatically disabled after downgrade. Where metering began partway through a pre-existing workspace's month, the limit is deferred until a complete UTC month can be measured; the UI discloses this. Plan limits require Redis mode and remain disabled by default.

A signed webhook for an unknown or mismatched order is acknowledged without granting access and generates a sanitized warning; this also supports payOS registration sample messages. An owner can check an order against the authenticated payOS API or cancel a confirmed unpaid pending link. A partial or uncertain payment remains a support-review case. The return URL is only a prompt to reconcile, never proof of payment. Payment order reconciliation, delayed jobs, entitlement races and the actual payOS registration/payment flow still require end-to-end qualification before checkout is enabled.
