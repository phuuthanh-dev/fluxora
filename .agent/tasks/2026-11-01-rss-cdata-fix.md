# RSS CDATA compatibility

## Identity
- Base: `955c00c0bdecf7e64444d328b5f539a3a2fa50db`
- Branch: `codex/rss-cdata-fix`

## Target slice IDs
- `APP-EXPANSION-1`

## Outcome
Read valid RSS feeds whose CDATA contains HTML doctype text, without accepting XML DTD or entity declarations.

## Reopen justification
A read-only live check of GitHub's public changelog feed on 2026-11-01 returned INVALID_RESPONSE because the feed embeds HTML doctype text inside CDATA. A separate Node.js public feed succeeded. The existing full verify used synthetic feeds and did not cover this case.

## Scope and evidence
- Keep response bounds and real DTD/entity rejection intact.
- Add regression tests for CDATA and comments containing doctype text, and actual malicious declarations.
- Run focused tests and typecheck. Recheck the public feed without credentials; no provider writes or deployment.
