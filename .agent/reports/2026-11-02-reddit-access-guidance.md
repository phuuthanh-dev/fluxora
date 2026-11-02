# Reddit access guidance — 2026-11-02

Targets: `APP-EXPANSION-1`, `EDITOR-QUALIFICATION-1`.

The Reddit credential form now describes the announced Public Data API
retirement and links directly to Reddit's timeline. The node description
indicates that an approved app is required. Existing connector behavior and
credentials remain unchanged; no Devvit capability is implied.

Source: [Reddit's October 2026 changelog](https://support.reddithelp.com/hc/en-us/articles/54353370049684-Changelog-October-8-2026).

Verification: manual visual inspection of the form in light and dark modes;
the existing connection form E2E checks the notice and link. A full
`npm run verify` passed on an isolated worktree with a dedicated PostgreSQL
database, loopback Redis and separate web/API ports: API 352 passed, web 32
passed, Playwright 144 passed. The initial isolated build failed because
dependencies were symlinked outside Turbopack's root; installing dependencies
in the isolated worktree resolved it. Existing GSAP/WebGL warnings occurred
without test failures. No live Reddit request or approval was obtained.

The change was released in PR [#65](https://github.com/phuuthanh-dev/fluxora/pull/65),
merged as `87542ed` and successfully deployed. Test coverage does not establish
a future Reddit access grant or continued access.
