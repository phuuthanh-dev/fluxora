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

```bash
cp .env.example .env
npm install
npm run dev
```

The frontend runs at `http://localhost:3000` and the API health endpoint is `http://localhost:3001/api/v1/health`.

If port `3001` is already occupied, run the API with `PORT=3002 npm run dev:api`.

Docker infrastructure and production deployment are intentionally deferred until after the MVP.

## License

MIT is the intended license for the first public release.
