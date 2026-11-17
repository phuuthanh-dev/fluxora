# payOS hosted checkout — preparation

> Historical development notes follow. For the current production status, see the live qualification note at the end of this document.

A dedicated Fluxora payOS channel has been created. The existing Pet Love channel is independent. Checkout remains disabled by default (`PAYOS_CHECKOUT_ENABLED=false`): proposed plan quotas are not enforced and this integration has not been qualified with a real payment. Do not advertise or enable paid plans until the items below are complete.

The API prepares a fixed-price order on the server for the authenticated workspace owner, reserves an order before contacting payOS, and uses the official SDK without create retries. An uncertain create remains in REVIEW and requires reconciliation rather than issuing a second link. A signed webhook is checked against the stored order and payOS's authoritative payment status before recording a payment. Workspace locking and an order state check prevent duplicate delivery from adding paid time twice. The initial implementation granted 30 days with manual renewal and blocked tier changes; the upgrade policy below replaces that restriction. Refunds, disputes, incomplete payments, abandoned links and ambiguous create failures require operator reconciliation; there is no automatic refund or recurring charge. Do not infer payment from the browser return URL. Never log provider credentials, full webhook data or checkout URLs.

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

## Production qualification — 2026-11-13

The Fluxora channel webhook and production checkout are enabled. An owner-authorized real Starter payment was recorded as paid by payOS and activated 30 days of Starter access through the webhook. A second unpaid checkout was created and cancelled through the product UI; payOS and Fluxora both reported it cancelled, and the original paid entitlement was unchanged. The owner and another user were checked for workspace billing isolation. API readiness and the Redis worker were healthy after enabling checkout and plan limits.

Renewal is manual and extends the same active paid tier by 30 days. An owner may upgrade active Starter to Pro at the full Pro price after explicitly reviewing that the existing Starter term ends without credit or refund. Confirmed settlement starts a new 30-day Pro term and resets the live-run allowance without deleting usage records; the next scheduled reset is still the start of the next UTC calendar month. A lower paid tier can be purchased after the current paid term ends. Refund requests are reviewed through Support. Workflow and concurrency limits are enabled; for existing workspaces with a partial first metering month, monthly run enforcement begins when a complete UTC period can be measured, including one starting with a verified upgrade. No separate workspace-count benefit is currently offered. A successful payment test does not establish capacity for a particular number of customers or cover every provider failure scenario.

## Card checkout — in progress

Lemon Squeezy is a separate hosted checkout; it does not replace the existing payOS channel. Its flag defaults to disabled. Configuration uses `LEMON_API_KEY`, `LEMON_SIGNING_SECRET`, `LEMON_STORE_ID`, `LEMON_STORE_HOST`, `LEMON_STARTER_VARIANT_ID`, `LEMON_PRO_VARIANT_ID` and `LEMON_TEST_MODE`; the webhook endpoint is `/api/v1/billing/lemon/webhook`. Never put secrets in source or client-side configuration. Test-mode checkout is prohibited when `NODE_ENV=production`.

Checkout is associated with one workspace order using a random nonce. After signature and nonce validation, Fluxora stores only the provider order identifier and status in `LemonPayment` before fetching the authoritative order; it does not persist the webhook payload. A transient provider API failure leaves the record `PENDING`, so the workspace owner can use the existing Check status action to retry. Signed events are matched against the provider-fetched paid order, one item and listed item price before entitlement settlement. The provider expresses VND item prices in hundredths, while converted order totals may differ; do not directly compare the displayed plan price with the converted total. Workspace settlement is locked, upgrades retain the existing quota-reset policy, and duplicate deliveries do not extend access twice.

Lemon checkout URLs can be reused until expiry. A distinct paid provider order for an already-settled checkout is recorded as `LemonPayment.status = REVIEW`, `reason = DUPLICATE`; it is not silently discarded or applied as a renewal. Support must inspect and handle that extra payment in Lemon, including refunds when appropriate. An order that conflicts with changed plan terms is also marked for review. Refund notifications are retained as `REFUNDED` and require support review; they do not automatically revoke access. These records contain identifiers and state, not card details or webhook content.

An operator can find unresolved entries without retrieving payment secrets or webhook bodies:

```sql
SELECT p."providerOrderId", p.status, p.reason, p."updatedAt",
       o.id AS "paymentOrderId", o."workspaceId", o.plan, o.amount
FROM "LemonPayment" p JOIN "PaymentOrder" o ON o.id = p."paymentOrderId"
WHERE p.status IN ('PENDING', 'REVIEW', 'REFUNDED')
ORDER BY p."updatedAt" DESC;
```

`PENDING` can be retried by the workspace owner through Check status. For a duplicate, check the provider order and refund it in Lemon when the support decision calls for a refund; the signed refund event changes that record to `REFUNDED`. `REFUNDED` is retained as an audit signal, not proof that support has completed its separate customer review. Do not change payment records or paid access based only on this query.

If no webhook reached Fluxora, the local order does not yet have the provider order identifier and Check status cannot infer it. Support should verify the order in Lemon and resend the original event from Lemon's webhook log; do not grant a plan based on a browser return or an unmatched email. A successful provider resend is verified and processed as above. An uncertain checkout creation, an expired/abandoned link or a permanently failed webhook remains a manual support case; card links cannot be cancelled through the payOS API. Do not issue a new checkout until the original is resolved.

On 2026-11-13, an isolated local Fluxora checkout received a real signed Lemon **Test mode** webhook and activated Starter for 30 days. Reusing the same test checkout produced a second paid test order; Fluxora retained the original term and recorded the second as `REVIEW / DUPLICATE`. No real funds were moved. This remains **unqualified for production** until the merchant is approved, live products and signing configuration are reviewed, operational support can resolve duplicate/refund/never-delivered events, and production-specific qualification is complete. Do not enable the flag on production solely because sandbox checkout succeeded.
# Whop Sandbox (development only)

Whop is not enabled for production. Sandbox checkout uses `WHOP_SANDBOX_ENABLED`, `WHOP_SANDBOX_API_KEY`, `WHOP_SANDBOX_WEBHOOK_SECRET`, `WHOP_SANDBOX_ACCOUNT_ID`, `WHOP_SANDBOX_STARTER_VARIANT_ID` and `WHOP_SANDBOX_PRO_VARIANT_ID` alongside `PLAN_LIMITS_ENABLED`. The API accepts this configuration only outside production with a localhost web origin. Never use real provider keys or data for tests.

Production configuration is separate: `WHOP_CHECKOUT_ENABLED`, `WHOP_API_KEY`, `WHOP_WEBHOOK_SECRET`, `WHOP_ACCOUNT_ID`, `WHOP_STARTER_VARIANT_ID` and `WHOP_PRO_VARIANT_ID`. It must remain disabled until pricing, tax, merchant readiness, deployment and reconciliation have been reviewed. A hidden Whop product can still be purchased by anyone who has its link; do not share links before release.

Checkout configurations carry a local order reference and random nonce. Webhooks require Whop's signed raw body and the provider's payment details are independently checked before applying existing plan rules. Repeated payments, refunds and changed plans require review rather than silently extending access. When the provider is unavailable after a webhook was received, Check status retries pending verification; events never delivered require provider-side resend. Sandbox cannot establish production costs, taxes, payouts or real card acceptance. Confirm those separately before any live release.

## PayPal Checkout (implementation; live qualification pending)

PayPal Checkout uses USD amounts stored per order in cents, independent of the existing VND providers. It is disabled by default and requires live merchant credentials, a registered webhook ID, owner-approved prices and an explicit opt-in. Sandbox uses separate credentials and an isolated local test database. Existing plan activation, full-price upgrade and quota reset rules apply only after verification of the order, reference, amount, currency and completed capture; repeated confirmations must not extend the term twice.

The webhook endpoint `/api/v1/billing/paypal/webhook` verifies notifications with PayPal before querying the order; an uncorrelated refund is retried rather than silently accepted. A verified refund is marked for Support review and does not automatically revoke access. Operator action remains necessary for uncertain creates, refunds, disputes and delivery failures. Sandbox proof does not establish live merchant eligibility, applicable fees or a successful production payment. Do not activate PayPal until merchant approval, USD prices, terms, support and end-to-end live qualification are reviewed.

References: [PayPal Checkout](https://developer.paypal.com/studio/checkout/standard/integrate), [webhook verification](https://developer.paypal.com/api/rest/webhooks/rest/), [refunds](https://developer.paypal.com/checkout/refund-payment).

Owner requested USD conversion on 2026-11-17: use Starter USD 3.88 and Pro USD 7.79 for 30 days, rounded to cents from 99,000 VND and 199,000 VND using the Vietcombank USD transfer buying reference of 25,540 VND/USD published 2026-11-16. Prices are fixed at checkout, not live FX; provider fees and actual conversion can differ. Revisit prices before activation. [Vietcombank exchange rates](https://www.vietcombank.com.vn/en/personal/cong-cu-tien-ich/ty-gia).
