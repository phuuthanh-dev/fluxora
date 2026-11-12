# Airtable and editor mapping

## Scope

The Airtable connector offers four record operations: list a page, get,
create, and update. A connection belongs to its Fluxora workspace and uses
the Airtable account and bases selected by that user during OAuth. Discovery
lists accessible bases, tables, fields and records. Lists are bounded to the
first 100 entries; the resource selector offers manual IDs when the desired
entry is not present. The write form currently supports text, number,
true/false, clearing a value, and values mapped from previous nodes. It does
not claim to support every Airtable field type, delete records, or Airtable
triggers.

Configure `AIRTABLE_CLIENT_ID`, `AIRTABLE_CLIENT_SECRET` and
`AIRTABLE_REDIRECT_URI` together on the server, and register the matching
callback with Airtable. The integration requests `data.records:read`,
`data.records:write` and `schema.bases:read`. Users must approve their own
account and resources. If OAuth is not configured, the connection screen
explains that it is unavailable. Do not commit credentials or use another
user's connection. A rotating refresh token is claimed atomically; an
uncertain refresh requires reconnection rather than replaying an old token.
Airtable warns that reuse of a rotated token can revoke access ([Airtable](https://support.airtable.com/articles/6412360049-troubleshooting-disconnected-oauth-integrations-in-airtable)).
Writes with an uncertain outcome are not automatically retried: check the
base before trying again.

n8n supports Airtable credentials and record operations; its breadth includes
additional operations and an Airtable trigger. Fluxora does not yet claim
parity ([n8n Airtable node](https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.airtable/)).

## Mapping and qualification

The existing mapper uses data from eligible upstream executions. The source
selector and search narrow suggestions; choosing one inserts the existing
expression syntax. At most 200 discovered paths are kept, and 18 matching
paths are displayed at once. Use manual expressions for paths beyond this
bound. This is not n8n's drag-and-drop mapping or data pinning; n8n documents
both expression and drag-and-drop mapping ([n8n mapping](https://docs.n8n.io/data/data-mapping/data-mapping-ui/)).

On 2026-11-12 a local test workflow with separate manual and webhook triggers
was published. A manual live run succeeded and showed the webhook branch as
skipped; the temporary workflow was deactivated afterwards. This verifies
only that entry path, not actual webhook delivery or mixed-provider trigger
handling. Provider credentials, OAuth distribution and real Airtable calls
must be validated separately before asserting production readiness.
