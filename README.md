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

The root route is the email/password sign-in page. Registering creates a personal owner workspace; the editor is available at `/editor` after sign-in.

Local development defaults to `EXECUTION_QUEUE_MODE=inline`, which runs mock work immediately and keeps the demo self-contained. To exercise the production-shaped queue path, run Redis, set `EXECUTION_QUEUE_MODE=redis`, start the API, and run `npm run dev:worker` in a second terminal.

If port `3001` is already occupied, run the API with `PORT=3002 npm run dev:api`.

To enable encrypted provider credentials, create a 32-byte base64 key and place it only in your local `.env`:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

Set that output as `APP_ENCRYPTION_KEY`. Credentials are encrypted before storage and are never returned by the API. Docker infrastructure and production deployment are intentionally deferred until after the MVP.

## License

MIT is the intended license for the first public release.
