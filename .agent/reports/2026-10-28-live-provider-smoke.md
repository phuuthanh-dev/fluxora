# Live provider smoke — first owner-approved run

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

## Required next action

Replace or rotate the workspace Steam credential with a valid Steam Web API key,
keep the existing 64-bit Steam ID, then run the same published workflow once
again. Only after Steam succeeds can the downstream Google Chat, Discord,
Telegram and Google Drive provider checks produce meaningful evidence.
