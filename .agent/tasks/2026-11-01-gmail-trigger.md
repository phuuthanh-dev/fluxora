# Task contract

## Identity
- Task ID: `2026-11-01-gmail-trigger`
- Base commit: `9286a32`
- Working branch: `codex/gmail-connector`
- Implementer: Codex
- Reviewer: user

## Outcome
Add a durable Gmail new-message polling trigger with clear activation and recovery semantics.

## Target slice IDs
- `GMAIL-1`

## In scope
- Gmail history, scoped credentials, durable checkpoints, queue dispatch, workflow activation and editor configuration.

## Explicitly out of scope
- External mailbox reads, production changes, Pub/Sub provisioning and exactly-once claims.

## Acceptance criteria
- [x] No silent checkpoint reset when history expires or queues fail.
- [x] Concurrent pollers, restarts and pagination are covered by synthetic tests and isolated queue/database recovery tests.
- [x] Activation, deactivation, published-version changes and manual testing have explicit behavior.
- [x] Users see relevant trigger status and recovery action.

## Required evidence
- Tests to add or update: history parsing, lease, queue recovery, activation, expiry and browser configuration.
- Commands to run: task check, provider-mocked tests, isolated integration tests, final full verify.
- UI/manual proof: inspect setup and failure state without real credentials.
