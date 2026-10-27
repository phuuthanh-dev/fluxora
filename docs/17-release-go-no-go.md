# Release Go/No-Go contract

This is the factual release gate for Fluxora. It separates checks that the
repository can prove from evidence that only an operator or the product owner
can supply. Passing automation is **not** proof that production is deployed or
that a provider integration works with real credentials.

## Commands

```bash
# Repository contracts only; reads no production .env and makes no requests.
npm run release:preflight

# Local deterministic tracked-file and production-config contract checks.
npm run security:check

# Validate a supplied production env file without printing any value.
node scripts/validate-production-env.mjs --env-file /path/to/.env.production

# GET requests to the three fixed localhost health targets.
npm run release:smoke

# Optionally target configured HTTP(S) origins; supplied paths are discarded.
npm run release:smoke -- \
  --api-origin https://api.fluxora.io.vn \
  --web-origin https://fluxora.io.vn
```

The smoke command can only issue `GET` requests to `/api/v1/health`,
`/api/v1/health/ready`, and `/`. It cannot deploy, mutate a database, or call a
provider. Use `--dry-run` to inspect the exact target URLs without networking.

## Automated pass

The read-only preflight must report no `BLOCKED` item for:

- required production environment names and HTTPS URL shapes;
- ordered Prisma migrations and the one-shot production migration service;
- API liveness, API dependency readiness, and web health endpoints;
- guarded PostgreSQL backup/restore scripts and immutable rollback;
- two-domain reverse-proxy and OAuth callback contracts;
- bounded Docker logs and execution redaction primitives;
- expected GitHub Actions secret/variable names, Redis CI service, and pinned
  action revisions.
- high-confidence tracked-secret scan, dependency audit, and non-printing
  production environment validation.

`npm run verify` includes these contracts. It never reads the real production
environment or secret values.

## Operator evidence required

Before a production release, an operator must record:

- DNS resolution and a valid TLS certificate for both production domains;
- `nginx -t`, API liveness/readiness, and web smoke results from the target VPS;
- a fresh database backup copied off-host and a successful restore drill into
  an isolated database;
- the known-good 40-character image SHA used for rollback and a rollback drill;
- adequate disk space and healthy PostgreSQL/Redis containers.

Do not paste credentials, tokens, private keys, environment contents, or backup
data into the evidence report.

## Owner input required

The product owner must separately provide or configure:

- GitHub environment secrets for VPS and private GHCR access;
- matching Google, GitHub, and Steam callback configuration;
- connector credentials through the encrypted Connections UI;
- explicit approval for one controlled live-provider run, followed by manual
  confirmation of its external side effect.

## NO-GO conditions

Release is blocked when any of these is true:

- repository preflight or `npm run verify` fails or skips Redis qualification;
- migrations are pending/unreviewed, no fresh recoverable backup exists, or the
  rollback SHA is unknown;
- either production domain lacks valid HTTPS or callback URLs do not match;
- API readiness cannot reach PostgreSQL and Redis;
- production secrets are missing, exposed, shared in logs, or use placeholders;
- a live workflow can activate without credential readiness and owner consent;
- the requested release includes unreviewed changes outside the tested commit.

## Current verdict

**CONDITIONAL GO for repository readiness; NO-GO for production rollout until
operator evidence and owner input above are complete.** This repository status
does not authorize deployment or real provider calls.

The ordered operator procedure is documented in
[`18-operator-qualification-runbook.md`](./18-operator-qualification-runbook.md).
