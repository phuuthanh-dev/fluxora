# Preserve Atom entry content when a summary is absent

## Identity

- Task ID: `2026-11-02-atom-content-fallback`
- Base commit: `6b240c217b0930fca545c3925abcb5d7e9222fd6`
- Working branch: `develop`
- Implementer: Codex
- Reviewer: Codex and CI

## Target slice IDs

- `APP-EXPANSION-1`

## Outcome

Preserve a feed entry's available Atom content as the existing bounded summary output when no summary is provided, while preserving current RSS and Atom summary precedence.

## In scope

- The RSS/Atom read adapter, synthetic fixtures, and documentation of the observed real feed and limits.

## Explicitly out of scope

- Feed polling triggers, HTML rendering, authorization, external writes, migrations and provider credentials.

## Acceptance criteria

- [ ] Atom entries with content but no summary return that content through summary, bounded by the existing limit.
- [ ] Existing description and summary precedence, XML safety and deterministic output remain unchanged.
- [ ] Synthetic tests and final verification cover the behavior.

## Safety boundaries

- No provider secrets, external writes or access to private feeds. Keep local web/API running.
