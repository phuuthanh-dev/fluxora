# Workflow Automation

An open-source, self-host-ready workflow automation platform. It is designed for personal use and a polished portfolio demo first, while keeping the execution engine extensible for small teams.

## MVP demo

`Cron → Steam Account Snapshot → condition → Google Chat daily report`

## Repository layout

```text
apps/web                 Next.js workflow editor and dashboard
apps/api                 NestJS API, scheduler, and workflow worker
packages/workflow-contracts Shared workflow graph and node contracts
docs                     Product, architecture, rules, and roadmap
infra                    Local infrastructure definitions
```

## Read first

All contributors and coding agents must read [`AGENTS.md`](./AGENTS.md) before changing code.

## Local setup

Install PostgreSQL 16 or another supported local PostgreSQL release, create an empty database, then configure the root `.env`:

```bash
# macOS/Homebrew example
brew install postgresql@16
brew services start postgresql@16
createdb workflow

cp .env.example .env
# Set DATABASE_URL in .env to the local connection, for example:
# postgresql://your-macos-user@localhost:5432/workflow?schema=public

npm install
npm run db:deploy
npm run dev
```

The frontend runs at `http://localhost:3000` and the API health endpoint is `http://localhost:3001/api/v1/health`.

Run browser acceptance coverage against the local PostgreSQL-backed app with `npm run test:e2e`. It starts (or reuses) the API and web development servers, registers an isolated test owner, and checks the editor onboarding flow.

The root route is the sign-in page. Registering creates a personal owner workspace; successful sign-in opens the dashboard at `/dashboard`, where workflows are created and opened in the editor.

Local development defaults to `EXECUTION_QUEUE_MODE=inline`, which runs mock work immediately and keeps the demo self-contained. To exercise the production-shaped queue path, run Redis, set `EXECUTION_QUEUE_MODE=redis`, start the API, and run `npm run dev:worker` in a second terminal.

If port `3001` is already occupied, run the API with `PORT=3002 npm run dev:api`.

To enable encrypted provider credentials, create a 32-byte base64 key and place it only in your local `.env`:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

Set that output as `APP_ENCRYPTION_KEY`. Credentials are encrypted before storage and are never returned by the API. Docker infrastructure and production deployment are intentionally deferred until after the MVP.

### Google Drive and Sheets

The editor's **Credentials** panel can store a manually supplied Google access token or begin the Google OAuth connection. For OAuth, create a Google OAuth web client with the redirect URI from `.env.example`, then set `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, and `GOOGLE_REDIRECT_URI` locally. The current scopes are Drive file access and Google Sheets access. Drive list/search/text upload/download and Sheets read/append/update work in mock mode without credentials; live mode requires a connected Google credential. A real Google account is deliberately not part of repository tests.

For a generic HTTP credential, save JSON with one of these shapes: `{ "authType": "bearer", "token": "…" }`, `{ "authType": "apiKey", "name": "X-API-Key", "value": "…", "location": "header" }`, `{ "authType": "basic", "username": "…", "password": "…" }`, or `{ "authType": "headers", "headers": { "X-Client": "…" } }`. Select the saved connection by name in a live HTTP Request node; its secret value is never returned to the browser.

### Google account sign-in

Google account sign-in is separate from the Google Drive/Sheets connector credential. Use the same Google OAuth web client, but register **both** redirect URIs from `.env.example`: `GOOGLE_REDIRECT_URI` for connector credentials and `GOOGLE_AUTH_REDIRECT_URI` for account sign-in. Set `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, and `GOOGLE_AUTH_REDIRECT_URI`. Once all three are present, the Google button changes from **Configure server** to **Continue securely**. The callback validates the OAuth state cookie, a Google-issued ID token, its issuer, verified email, and audience before it creates or links an account identity. Do not place these values in the browser environment.

Steam OpenID is intentionally not used for Steam Account Snapshot data: it proves ownership of a Steam identity but does not issue the Web API key required by the Steam API. The Steam node continues to require a separately saved API key and 64-bit Steam ID.

An Approval node may notify either `google_chat` or `http_webhook`. For an outgoing webhook, create an HTTP credential whose encrypted JSON includes a `webhookUrl` plus any normal HTTP auth shape, for example `{ "webhookUrl": "https://example.test/approvals", "authType": "headers", "headers": { "X-Signature": "…" } }`. The callback receives `{ type, message, approvalUrl }`; the approval remains owner-authenticated inside the app.

See [`docs/09-demo-walkthrough.md`](./docs/09-demo-walkthrough.md) for the safe local demo flow and the separate optional live-provider checklist.

## License

MIT is the intended license for the first public release.
