# Public website and release contract

Owner authorization: complete and release public website, then refine the authenticated UI (2026-10-29). The maintainer approved publishing phuuthanh2003@gmail.com for support/privacy/data requests.

## Routes and ownership
- `/`: existing landing; footer links to Support, Privacy and Terms.
- `/privacy`: data collection, separate login/Google connections, broad Drive/Sheets scope disclosure, configured transfers, retention and owner-verified support requests.
- `/terms`: use, live action responsibility, external provider limits, acceptable use and availability without invented service guarantees.
- `/support`: email for private issues, public GitHub issue link, safe reporting instructions and provider revocation link.
- `/contact`: permanent redirect to `/support`.
- Unmatched routes: branded 404 with navigation back to home/workspace.
- `/robots.txt`, `/sitemap.xml`, `/opengraph-image`: public discovery/share assets; authenticated routes and login are noindex and absent from sitemap. Robots directives are not authorization controls.

`features/public-site/site.ts` centralizes the public identity, approved contact, links and metadata. `PublicShell`/`PublicSection` reuse existing BrandLockup, semantic tokens and Gilroy. Public documents use server markup and native navigation without WebGL or a second animation layer. Each public page has its own canonical URL; the root layout does not accidentally canonicalize private pages to home.

## Truthfulness boundaries
The current Google connector requests Drive and Sheets scopes; the policy must not claim it only accesses selected files. Login identities and connector tokens remain separate. Full-account deletion is a support process, not a newly implemented endpoint. Connection deletion can be blocked by dependencies. Provider revocation does not erase historic outputs. Execution retention is installation-configured, not a promised universal period. No SLA, certification, guaranteed regional residency or guaranteed backup policy is claimed.

Policies describe current operation; they do not establish Google verification or legal certification. No OAuth console submission is included. Google branding must point to the deployed policy URL when the owner resumes that task.

## Evidence and release
Local public-route tests cover desktop/tablet/mobile, keyboard skip link, no-JS documents, metadata, private noindex, social PNG, sitemap, redirect and 404. Run the full quality gate before committing; CI must pass for the exact PR head. Release only through develop → main. No schema, infrastructure or production data changes belong to this slice.

## References reviewed
- Google OAuth policies: https://developers.google.com/identity/protocols/oauth2/policies
- Google API Services User Data Policy: https://developers.google.com/terms/api-services-user-data-policy
- Google verification requirements: https://support.google.com/cloud/answer/13464321
- Installed Next.js metadata/robots/sitemap APIs in node_modules/next/dist/docs.
