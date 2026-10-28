# Uncertain webhook registration response

## Target slice IDs

- `WEBHOOK-UNCERTAIN-UX-1`

## Outcome

After a failed registration request, clear any previously displayed secret,
prevent another mutation until endpoint status reloads, and explain that the
request may have succeeded even though the secret was not received.

## Proof

Browser tests simulate a lost response and check the warning, status reload,
and disappearance of the previous secret. Run the full quality gate. This
does not recover a secret after a successful commit and lost HTTP response.
