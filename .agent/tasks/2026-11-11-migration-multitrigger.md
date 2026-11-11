# Migration safety and Steam multiple triggers

## Identity
- Task ID: `2026-11-11-migration-multitrigger`; base `4b9fb0e`; branch `develop`.

## Target slice IDs
- `OPS-1`
- `MULTI-TRIGGER-1`

## Scope and acceptance
- Preserve old VPS data and forwarding while DNS caches persist; inspect production and document recovery limitations.
- Pin verified SSH host fingerprint for both CI deploy connections, fail closed when absent.
- Support independent schedule and Steam news triggers with isolated execution and durable recovery; preserve checkpoint integrity and existing credentials. No unrelated trigger behavior changes.
- Compare documented n8n behavior; audit changes and run one final verify, create PR develop to main and merge on passing CI.
- Do not send notifications for testing or destroy production data. Retain unrelated local changes.
