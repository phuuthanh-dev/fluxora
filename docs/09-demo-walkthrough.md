# Local MVP Demo Walkthrough

This walkthrough demonstrates the portfolio flow without placing a provider secret in source control, browser fixtures, or logs.

## Local mock demo

1. Run PostgreSQL, configure `.env`, then start the app with `npm run dev`.
2. Register an email/password owner account. The app creates a personal workspace, then opens the dashboard where you can create the Steam daily report workflow.
3. Open **Manage → Credentials**. Choose **Steam** and save the empty-safe template only when you are ready to supply a real key; choose **Google Chat webhook** for the destination connection. The browser never receives either secret again after save.
4. Select the Steam and Google Chat nodes on the canvas. Use their credential pickers to choose the saved connections by name.
5. Use the Manual Trigger's **Test data** panel to provide a harmless mock payload, then choose **Run test**. The execution inspector shows each node's redacted input/output, attempts, status, and duration.
6. Save the draft, publish it, then use **Go live** to inspect the explicit side-effect confirmation for the immutable release (cancel for the safe demo) or use **Manage → Version history** to inspect it.
7. For inbound automation, add a Webhook trigger, publish, then use **Manage → Webhook endpoint** to create a one-time secret and test the endpoint. For human review, add an Approval node and show the waiting/resume flow.

## Optional live Steam → Google Chat demonstration

Do this only with credentials the owner supplies through the credential panel:

1. Create a Steam Web API key and obtain the public account's 64-bit Steam ID.
2. Create a Google Chat incoming webhook in the intended space.
3. Save each connection in the app and select it by name in the Steam and Google Chat nodes.
4. Ensure the graph is `Schedule → Steam account snapshot → Google Chat message`, set the schedule/timezone, save, and publish.
5. Trigger a live run manually after publishing, or wait for the configured schedule. Confirm delivery in the intended Chat space and inspect only the redacted execution record in the app.

Live-provider verification is intentionally outside automated repository tests because credentials belong to the owner.

## Optional Google account sign-in

1. In Google Cloud, register the account-login callback from `GOOGLE_AUTH_REDIRECT_URI` in addition to the connector callback.
2. Set `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, and `GOOGLE_AUTH_REDIRECT_URI` only in the API environment.
3. Reload the root sign-in page. The Google action should read **Continue securely**.
4. Complete consent with a verified Google email. The app creates or links the Google identity, sets an HTTP-only app session, and redirects to the dashboard.

Do not use Steam OpenID as a substitute for a Steam Web API key; it only proves a Steam identity.
