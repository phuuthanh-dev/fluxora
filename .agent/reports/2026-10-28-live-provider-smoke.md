# Live provider smoke — owner-approved runs

## Scope

One owner-approved live execution of the published `Steam daily report`
workflow was started from the local authenticated editor. The run used
published version `13` and real workspace credentials. No retry was issued.

## Result

| Node/provider | Result |
|---|---|
| Steam account snapshot | Failed with `HTTP_ERROR`; Steam `GetPlayerSummaries` returned HTTP 403 |
| Google Chat | Skipped because the upstream Steam node failed |
| Discord | Skipped because the upstream Steam node failed |
| Telegram | Skipped because the upstream Steam node failed |
| Google Drive | Skipped because the upstream Steam node failed |

The run did not reach downstream delivery nodes, so no downstream live delivery
is claimed by this report. The failure is consistent with an invalid, revoked,
or otherwise rejected Steam Web API key; the response did not expose or log the
key. The application classified HTTP 403 as non-retryable, which avoided an
accidental duplicate attempt.

## Second owner-approved run after credential rotation

The workspace Steam credential was rotated and the same published version `13`
was run once more from the authenticated local editor. The execution succeeded
in `5.3 s` with no retry:

| Node/provider | Result | Evidence |
|---|---|---|
| Schedule | Succeeded | `trigger.cron`, attempt 1, 6 ms |
| Steam account snapshot | Succeeded | `action.steam.account-snapshot`, attempt 1, 2.2 s; returned the configured Steam profile and game summary |
| Google Chat | Succeeded | `delivered: true`, provider `google_chat` |
| Discord | Succeeded | provider `discord`, delivery result returned; webhook destination remained redacted |
| Telegram | Succeeded | provider `telegram`, message ID returned; destination remained the configured chat ID |
| Google Drive | Not executed | The node is currently disconnected from the graph, so it is correctly absent from the execution timeline |

No credential, webhook URL, or raw provider secret was exposed in the UI
execution output. The successful run proves the rotated Steam credential and
the three connected notification providers for this workflow version. It does
not qualify Google Drive until that node is connected and run intentionally.

## Required next action

If Google Drive qualification is required, connect it to the workflow, choose
an explicit read-only operation such as `List files`, and run a separate
owner-approved smoke. Keep that test separate from the notification workflow so
it cannot create or overwrite a file accidentally.
