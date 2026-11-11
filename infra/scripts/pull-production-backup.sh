#!/bin/sh
set -eu
umask 077

# Run on the off-host backup machine. SSH keys and host keys are provisioned
# separately; database passwords never pass through the command line.
: "${FLUXORA_BACKUP_HOST:?Set FLUXORA_BACKUP_HOST to the trusted SSH destination}"
: "${FLUXORA_BACKUP_SSH_KEY:?Set FLUXORA_BACKUP_SSH_KEY}"
: "${FLUXORA_BACKUP_KNOWN_HOSTS:?Set FLUXORA_BACKUP_KNOWN_HOSTS}"
: "${FLUXORA_BACKUP_DIR:?Set FLUXORA_BACKUP_DIR}"
mkdir -p "$FLUXORA_BACKUP_DIR"
chmod 700 "$FLUXORA_BACKUP_DIR"
timestamp=$(date -u +%Y%m%dT%H%M%SZ)
destination="$FLUXORA_BACKUP_DIR/fluxora-postgres-$timestamp.dump"
temporary=$(mktemp "$FLUXORA_BACKUP_DIR/.fluxora-postgres.partial.XXXXXX")
trap 'rm -f -- "$temporary"' EXIT
trap 'exit 1' HUP INT TERM

ssh -i "$FLUXORA_BACKUP_SSH_KEY" -o IdentitiesOnly=yes -o BatchMode=yes \
  -o StrictHostKeyChecking=yes -o "UserKnownHostsFile=$FLUXORA_BACKUP_KNOWN_HOSTS" \
  -o ConnectTimeout=15 "$FLUXORA_BACKUP_HOST" \
  'docker exec workflow-automation-db-1 sh -c '\''exec pg_dump --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" --format=custom --no-owner --no-acl'\''' > "$temporary"

# pg_restore validates the archive table of contents. A restore rehearsal is
# still necessary to establish that the dump can actually be restored.
pg_restore --list "$temporary" > /dev/null
test -s "$temporary"
ln "$temporary" "$destination"
printf 'Backup created: %s\n' "$destination"
