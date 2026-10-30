# Shiplog

Release history and communication on the same Supabase project and shared
`@jordiorriols/ui` package as Ladders, Planner and Pulse.

## Current vertical slice

- Shared Supabase accounts, production cross-subdomain sessions, email/GitHub
  login, signup and password recovery through UI.
- Existing workspace creation, switching and per-app owner/editor/viewer sharing.
- Applications with private-by-default catalog visibility and initial staging and
  production environment records.
- Manual semantic-version releases with separate internal and public notes.
- Explicit publication/unpublication, independent of lifecycle and deployment.
- **One revocable public catalog URL per workspace**, listing all included
  applications with a URL-backed application filter. Individual release URLs
  remain inside that same catalog.
- Database-enforced authorization, unique application versions and append-only
  audit events. Public responses are explicitly serialized on the server.

There are no fake deployment or QA statuses. Creating or publishing release notes
does not claim that a release is deployed or approved.

## Local development

UI's Shiplog registry update is in https://github.com/JordiOrriols/ui/pull/1.
The intended registry dependency is UI `^0.3.17`; merge/release that PR before
installing this project on a fresh checkout. Local validation during bootstrapping
used a packaged build of that candidate, not an npm link. No candidate archive
or local dependency path belongs in the committed manifest.

```sh
# GITHUB_TOKEN needs read:packages for @jordiorriols/ui.
npm install
cp .env.example .env
# Configure the SAME Supabase URL and publishable key as the other apps.
npm start
```

Open http://127.0.0.1:5178. Environment files are ignored. Never place service-role
keys, database passwords or integration tokens in Vite environment variables.
Generate and commit the registry lockfile after UI publication; the deploy
workflow uses `npm ci`.

Authentication screens reuse the existing six-language auth catalogs.
The first release-management screens currently use English fallback copy.

## Database

Migrations preceding `20261030190000_shiplog_core.sql` are the shared project's
existing history, copied so a clean test database applies the real migrations
in order without requiring a sibling checkout. They must not be re-applied
manually against an existing project.

The Shiplog migration extends workspace app validation and adds:

- `shiplog_applications`, `shiplog_environments`
- `shiplog_releases`, `shiplog_release_changes`
- `shiplog_audit_events`, `shiplog_portals`

Internal tables have RLS and authenticated read grants. Mutations go through
transactional, explicitly authorized RPCs. Anonymous users cannot query internal
tables. `shiplog_public_catalog(token)` returns only enabled application names
and published release fields. Catalog tokens are opaque and revocable; they are
shareable links, not an account permission.

```sh
npx supabase link --project-ref <shared-project-ref>
npx supabase db push --linked --dry-run
# Review the list and obtain approval before applying shared database changes.
npx supabase db push --linked
```

Register `https://shiplog.jordiorriols.cat/?auth_app=shiplog` and
`http://127.0.0.1:5178/?auth_app=shiplog` in Supabase's authentication redirect
allow-list. Shared session and callback routing come from UI.

## Verification

```sh
npm run compile
npm run lint
npm run format:check
npm test
npm run build
```

Database tests use PGlite with the complete shared migration chain and Supabase
auth-role stand-ins. They test workspace isolation, editor/viewer permissions,
SemVer constraints, publication, catalog projection and revocation.
Browser tests live in the separate `e2e-tests` project under `tests/shiplog`.

GitHub Actions follows the existing apps: pushes to `main` or `master` compile,
lint, format-check, test and build before GitHub Pages deployment. Configure
package Actions access or `UI_READ_TOKEN`, Supabase URL/publishable-key variables,
Pages and the Shiplog custom domain before deployment.

## Next vertical slices

1. Draft editing, included changes and public preview.
2. Application-scoped API keys, idempotent CI release creation and test ingestion.
3. Checklist snapshots, QA/E2E readiness rules and approvals.
4. Deployment events, environment versions and rollback tracking.
5. Incidents, affected/fixed/verified versions and private attachments.
6. Jira email outbox, retries, notifications and comparison.

The full product brief is the workspace-level `shiplog.md`; this initial
foundation deliberately does not pretend the later workflows are implemented.
