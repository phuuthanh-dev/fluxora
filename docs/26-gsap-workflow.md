# GSAP skills and animation workflow

## Installation and ownership

The owner requested the official GreenSock skills on 2026-10-29 while the
homepage readability/motion slice was in progress. Eight upstream skills are
pinned to `aed9cfd3277740755f6bfc1155c7aa645403b760`:
https://github.com/greensock/gsap-skills/tree/aed9cfd3277740755f6bfc1155c7aa645403b760/skills

- User installation: `~/.codex/skills/gsap-*` on the current machine.
- Repository installation: `.agents/skills/gsap-*`, tracked with MIT notice and
  provenance. These files are agent instructions, not shipped browser assets.
- No skill auto-update, npm lifecycle hook or new runtime dependency is added.
  Codex can discover newly installed skills on the next turn. This session reads
  the installed instructions directly to apply them immediately.

## Choose the smallest relevant set

| Work | Read |
|---|---|
| Tweens, easing, media preferences | `gsap-core` |
| React/Next lifecycle and scoping | `gsap-react` |
| Scroll sections, scrub or pinning | `gsap-scrolltrigger` |
| Multi-step sequencing | `gsap-timeline` |
| Performance review | `gsap-performance` |
| Specific plugin, e.g. Flip/SplitText | `gsap-plugins` |
| Mapping/interpolation helpers | `gsap-utils` |
| Vue/Svelte integration | `gsap-frameworks` |

Read selected SKILL.md files fully; do not load all eight into every task.
Upstream recommendations do not override Fluxora's product boundaries. Verify
examples against installed versions; a skill is guidance, not executable proof.

## Fluxora implementation contract

1. Keep marketing motion in the marketing feature. Gilroy, global theme tokens
   and shared component roles remain the typography/design foundation.
2. Run animation setup inside a client effect. Register plugins before use.
   Existing `useEffect` plus scoped `gsap.matchMedia` is sufficient; the React
   skill explicitly permits context cleanup without adding `@gsap/react`.
3. `matchMedia` already creates a context. Do not nest another `gsap.context`
   inside it. Revert the owned media context on pause/unmount and handle manual
   listeners/resources separately. Never kill all application ScrollTriggers.
4. Prefer transform/opacity for entrances; stagger small groups. Use timelines
   with labels for multiple phases rather than chained arbitrary delays. Keep
   the existing handoff's measured geometry; optimization is separate work.
5. Keep readable server markup, reduced-motion and pause paths. The first
   reveal frame remains readable; do not hide focusable controls with opacity 0.
6. Preserve one GSAP/Lenis/R3F ticker. Refresh after actual layout changes, not
   on each animation frame. Do not add another smooth-scroll owner or global
   tween defaults to implement one section.
7. Verify the affected motion in an ordered recording and at mobile/tablet/
   desktop sizes; exercise pause, preferences, route exit, no-JS and no-WebGL.
   Run the repository gate and record actual failures without weakening CI.

## Application in the current slice

`LandingReveal` replaces its previous Motion reveal with scoped GSAP entrance
tweens, with a 0.07s stagger for FAQ/footer groups. It uses one media context,
client-side registration, transform/opacity and cleanup on preference/pause.
The skill audit is bounded to that new implementation; the existing renderer
and handoff stay within their separately tested lifecycle contracts.

Public body/FAQ/footer sizes and readability evidence are in
`22-public-landing-v2.md` and the current slice report. Further options are SVG
connector drawing, sample-chart entry and subtle fine-pointer CTA feedback.
Add them as bounded follow-ups with visual proof, rather than enabling plugins
or effects merely because a skill is installed.

## Sources

- [GreenSock skills](https://github.com/greensock/gsap-skills).
- [OpenAI: repository skills and AGENTS.md](https://developers.openai.com/blog/skills-agents-sdk).
