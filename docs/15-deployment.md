# Production deployment

This document describes the first self-hosted deployment shape for Fluxora. It is deliberately conservative for the current 14 GB VPS and the target of approximately five users.

## Runtime shape

```text
Nginx + HTTPS
  ├── fluxora.io.vn      → 127.0.0.1:3000 (Next.js)
  └── api.fluxora.io.vn  → 127.0.0.1:3001 (NestJS API)

Docker Compose
  ├── web       Next.js UI
  ├── api       NestJS REST API and scheduler ingress
  ├── worker    BullMQ execution worker
  ├── migrate   Prisma migration job
  ├── db        PostgreSQL 16
  └── redis     Redis 7 with AOF queue persistence
```

The API and worker use the same application image and encryption key. Only the API process runs scheduler ingress; the worker runs execution jobs. PostgreSQL and Redis are private Docker-network services. Production exposes only loopback ports 3000 and 3001 to Nginx.

## Files

- `apps/api/Dockerfile` builds the API and worker image.
- `apps/web/Dockerfile` builds the Next.js image with `NEXT_PUBLIC_API_URL`.
- `infra/docker-compose.production.yml` defines the production services, health checks, volumes, and log rotation.
- `infra/.env.production.example` is the production variable contract.
- `infra/scripts/deploy.sh` accepts only a full lowercase commit SHA as the image tag, applies migrations, starts services, and checks health.
- `infra/scripts/rollback.sh` restarts API/worker/web at a known-good full commit SHA.
- `infra/scripts/backup-postgres.sh` creates a permission-restricted custom-format PostgreSQL backup.
- `infra/scripts/restore-postgres.sh` restores a named backup only with an explicit destructive-operation confirmation.
- `infra/nginx/workflow-automation.conf.template` is the HTTP reverse-proxy template. TLS is added by the VPS operator with the chosen certificate workflow.

## One-time VPS setup

The production deployment uses `fluxora.io.vn` for the web application and
`api.fluxora.io.vn` for the API. Both `A` records point to `103.140.249.73`:

```text
@    A    103.140.249.73
api  A    103.140.249.73
```

```bash
sudo mkdir -p /opt/workflow-automation
sudo chown -R dev:dev /opt/workflow-automation
cp infra/.env.production.example /opt/workflow-automation/.env.production
chmod 600 /opt/workflow-automation/.env.production
```

Fill the env file with generated values. `APP_ENCRYPTION_KEY` must be a base64-encoded 32-byte key; losing it makes encrypted credentials unrecoverable. `DATABASE_URL` and `REDIS_URL` are constructed by Compose from the database credentials and private service names.

The GitHub Actions deploy workflow expects these GitHub Actions secrets:

- `VPS_HOST`
- `VPS_USER`
- `VPS_SSH_KEY` (a deploy-only key, not a personal private key)
- `GHCR_PULL_USERNAME` (required when the application packages are private)
- `GHCR_PULL_TOKEN` (read-only package token, required when the application packages are private)

The production workflow reads the public frontend API origin from the `NEXT_PUBLIC_API_URL` repository/environment variable. It temporarily falls back to a legacy secret with the same name so an existing setup does not break during migration; prefer the variable and remove the old secret after the next successful production build.

If GHCR packages are private, configure `GHCR_PULL_USERNAME` and `GHCR_PULL_TOKEN` as GitHub Actions secrets. The deploy workflow authenticates Docker on the VPS immediately before pulling the immutable application images. Do not place that token in this repository or in the production env file.

## Continuous deployment

After the `Quality gate` succeeds for a push to `main`, the production workflow checks out that exact commit SHA, builds both images in GitHub Actions, pushes them to GHCR, copies the deployment files, and runs the remote deploy script. The workflow also keeps `workflow_dispatch` for an explicit redeploy or rollback by commit SHA. Mutable tags such as `latest` and `staging` are rejected by the deployment contract.

```bash
IMAGE_TAG=<40-character-commit-sha> \
  APP_DIR=/opt/workflow-automation \
  /opt/workflow-automation/infra/scripts/deploy.sh
```

The deploy script starts the database/Redis, creates a restricted PostgreSQL backup, then runs Prisma migrations before starting the API, worker, and web services. A failed backup stops the release before migration. It does not enable any workflow or call a real provider.

Before pulling a release, the deploy scripts require at least 2 GiB of free space on the application filesystem (`MIN_FREE_KB` can override the threshold). After starting the stack they check liveness, dependency readiness, and the web response. A failed preflight or smoke check stops the deployment before image cleanup.

## Nginx and HTTPS

Render the template with only the two intended variables so Nginx variables
such as `$host` are preserved:

```bash
export APP_DOMAIN=fluxora.io.vn API_DOMAIN=api.fluxora.io.vn
envsubst '${APP_DOMAIN} ${API_DOMAIN}' \
  < infra/nginx/workflow-automation.conf.template \
  | sudo tee /etc/nginx/sites-available/workflow-automation.conf >/dev/null
sudo ln -sfn /etc/nginx/sites-available/workflow-automation.conf \
  /etc/nginx/sites-enabled/workflow-automation.conf
sudo nginx -t
sudo systemctl reload nginx

# Run after both A records resolve to this VPS.
sudo certbot --nginx --domain fluxora.io.vn --domain api.fluxora.io.vn --redirect
```

The resulting HTTPS origins must match the web/API and OAuth configuration:

```text
WEB_ORIGIN=https://fluxora.io.vn
NEXT_PUBLIC_API_URL=https://api.fluxora.io.vn/api/v1
GOOGLE_REDIRECT_URI=https://api.fluxora.io.vn/api/v1/oauth/google/callback
GOOGLE_AUTH_REDIRECT_URI=https://api.fluxora.io.vn/api/v1/auth/google/callback
GITHUB_AUTH_REDIRECT_URI=https://api.fluxora.io.vn/api/v1/auth/github/callback
STEAM_OPENID_RETURN_URI=https://api.fluxora.io.vn/api/v1/auth/steam/callback
STEAM_OPENID_REALM=https://api.fluxora.io.vn
```

OAuth providers are configured separately and are not enabled by merely
deploying the containers.

## Backups and operations

- Run `npm run release:preflight` from the checked-out release before rollout. It reads repository contracts only, never the real production environment or secret values.
- Run `npm run security:check` and `npm audit --omit=dev --audit-level=high` in CI/release review. The tracked-file scan reports file/line metadata only and is intentionally a high-confidence guard, not a substitute for GitHub secret scanning.
- On the target host, validate the production env contract by name and shape without printing values:

  ```bash
  node scripts/validate-production-env.mjs --env-file /opt/workflow-automation/.env.production
  ```

- Back up PostgreSQL before migrations and on a schedule, then copy encrypted backups off the VPS:

  ```bash
  APP_DIR=/opt/workflow-automation infra/scripts/backup-postgres.sh
  ```

- Test restoration only into an isolated database/stack. The restore command is destructive and deliberately requires `CONFIRM_RESTORE=RESTORE`:

  ```bash
  CONFIRM_RESTORE=RESTORE APP_DIR=/opt/workflow-automation \
    infra/scripts/restore-postgres.sh /path/to/postgres-YYYYMMDDTHHMMSSZ.dump
  ```

- Preserve the `postgres_data` volume and never use `docker compose down -v` in production.
- After a successful health check, deploy scripts retain the current and previous API/Web commit-SHA images and remove only older SHA-tagged images from those two application repositories. PostgreSQL/Redis images and volumes are never part of this cleanup. Rollback can still pull any older known-good SHA from GHCR when needed.
- `.github/workflows/retain-ghcr.yml` runs weekly and keeps the five newest immutable SHA-tagged versions for each application package. It never deletes mutable/non-SHA tags; manual runs default to dry-run so retention can be inspected before deletion.
- Application deploys explicitly pull only `migrate`, `api`, `worker`, and `web`; PostgreSQL/Redis are pulled by Compose only when missing and are not refreshed on every application release.
- Keep execution retention bounded by the configured success/failed day limits and maximum count.
- Docker logs are limited to three 10 MB files per service.
- Use `docker compose ps`, `docker compose logs --tail=100 api worker`, and the API readiness endpoint for triage.
- The current VPS has limited disk; do not build images on-host and prune only unused images after verifying the retained rollback tag.

## Production gate before Go Live

Use the complete status/evidence split in [`17-release-go-no-go.md`](./17-release-go-no-go.md). The repository can prove contract integrity, but it cannot prove DNS, TLS, recoverability, provider credentials, or a real external side effect without operator/owner evidence.

Follow [`18-operator-qualification-runbook.md`](./18-operator-qualification-runbook.md) for the ordered operator procedure and evidence fields.

1. HTTPS works for both domains and CORS uses the exact app origin.
2. `/api/v1/health` returns OK and `/api/v1/health/ready` reports PostgreSQL and Redis ready.
3. Email/password login works without provider credentials.
4. Google/GitHub/Steam callbacks are tested only after the owner supplies matching provider configuration.
5. A mock workflow test is successful.
6. A published workflow remains inactive until the owner explicitly clicks **Go live**.
7. A real provider workflow is tested manually with the owner's own credentials and its side effects confirmed.

