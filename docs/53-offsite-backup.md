# Production database recovery

The production PostgreSQL database stores workflows, executions and encrypted
connections. A copy of the deployment environment alone does not contain them.
The database archive and its matching `APP_ENCRYPTION_KEY` are both needed to
recover connections. Keep the key separately; never commit either file.

On 2026-11-12 a custom-format archive was pulled to the owner's Mac and
restored into a disposable PostgreSQL 16 container with networking disabled.
The restored snapshot contained 20 workflows, 17 credentials and 50
executions. The owner's previously saved environment backup was checked to
contain the same encryption key as the active API. The subsequent full-app
rehearsal is described below.

`infra/scripts/pull-production-backup.sh` streams a consistent PostgreSQL dump
over host-key-verified SSH to the backup machine, verifies that `pg_restore`
can read its table of contents and publishes the file atomically. It requires
`FLUXORA_BACKUP_HOST`, `FLUXORA_BACKUP_SSH_KEY`,
`FLUXORA_BACKUP_KNOWN_HOSTS`, `FLUXORA_BACKUP_DIR`, SSH and PostgreSQL client
tools compatible with the server. Backups include private data; restrict the
directory to the owner and store the matching environment separately.

On the owner's Mac the launch agent `vn.fluxora.production-backup` runs at
03:00 local time while the user session and network are available. Archives
are in `~/.local/share/fluxora/backups/production-daily`, with logs one
directory above. A sleeping, offline or logged-out Mac is not a continuously
available offsite backup target; inspect backup timestamps and logs regularly.
This does not provide independent disk-failure protection if the Mac and its
backup files are lost together. No automatic pruning is configured.

For a manual freshness check, run `npm run backup:check` on the backup Mac.
It returns a failure if no archive is found or the newest archive is older than
36 hours; it checks timestamps and file size only, not restoration or the key.
This command is not a scheduled alert. Inspect the launch-agent log and repeat
an isolated restore when investigating failures.

On 2026-11-12 the 03:08 local backup was restored to a fresh PostgreSQL 16
container on a Docker internal network. The exact deployed API and web images
started on that network with scheduling disabled and no worker; API readiness
and the web home page returned HTTP 200. The actual vault implementation
decrypted all 17 restored connections using the separately saved matching key;
20 workflows were present. No credential values were displayed and the network
had no external provider access. The temporary containers and network were
removed afterwards. This proves this particular snapshot and key can start the
API and web and decrypt stored connections; it does not prove live provider
access, a full authenticated UI journey, Redis queue recovery or independent
storage durability.

Before a real restore, protect the current database, restore to a separate
empty instance first, confirm the migration version and validate the matching
encryption key. Follow `infra/scripts/restore-postgres.sh` and the deployment
runbook; never point restore commands at the live database for a rehearsal.
