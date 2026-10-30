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
- Editable, never-published drafts and categorized changes, private by default.
- Authenticated public previews using the same server projection and rendering
  as the public catalog; only explicitly public changes are included.
- Content is permanently locked after first publication (even after unpublishing)
  or when the release leaves draft status. Draft mutations record private
  before/after audit history.
- Explicit publication/unpublication, independent of lifecycle and deployment.
- **One revocable public catalog URL per workspace**, listing all included
  applications with a URL-backed application filter. Individual release URLs
  remain inside that same catalog.
- Database-enforced authorization, unique application versions and append-only
  audit events. Public responses are explicitly serialized on the server.

There are no fake deployment or QA statuses. Creating or publishing release notes
does not claim that a release is deployed or approved.

## Local development

Use Node.js 26 LTS with npm 11.20.0. Run `nvm install && nvm use` to select
the `.nvmrc` version used by CI and deployment.

Shiplog uses UI `^0.3.18` from GitHub Packages, including the shared Shiplog
project registration, workspace sharing and authentication redirects.
The committed lockfile contains registry packages, not local links or archives.

```sh
# GITHUB_TOKEN needs read:packages for @jordiorriols/ui.
npm ci
cp .env.example .env
# Configure the SAME Supabase URL and publishable key as the other apps.
npm start
```

Open http://127.0.0.1:5178. Environment files are ignored. Never place service-role
keys, database passwords or integration tokens in Vite environment variables.
The deploy workflow also uses `npm ci`.

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

`20261030200000_shiplog_draft_content.sql` adds the draft/change RPCs and the
shared preview projection. It also backfills first-publication timestamps from
existing audit history, including previously unpublished releases. The migration
has been applied to the shared Supabase project with approval.

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
Draft tests cover change CRUD, permission checks, historical locks and migration
backfill. Browser tests also compare draft preview and anonymous catalog payloads
to verify that internal notes and private changes never leak.
Browser tests live in the separate `e2e-tests` project under `tests/shiplog`.

GitHub Actions follows the existing apps: pushes to `main` or `master` compile,
lint, format-check, test and build before GitHub Pages deployment. Configure
package Actions access or `UI_READ_TOKEN`, Supabase URL/publishable-key variables,
Pages and the Shiplog custom domain before deployment.

## Next vertical slices

1. Application-scoped API keys, idempotent CI release creation and test ingestion.
2. Checklist snapshots, QA/E2E readiness rules and approvals.
3. Deployment events, environment versions and rollback tracking.
4. Incidents, affected/fixed/verified versions and private attachments.
5. Jira email outbox, retries, notifications and comparison.

The full product brief is the workspace-level `shiplog.md`; this initial
foundation deliberately does not pretend the later workflows are implemented.
