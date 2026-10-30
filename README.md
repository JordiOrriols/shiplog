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
- Owner-managed application checklist templates, snapshotted for each new release.
  Later template edits never alter existing release checklists.
- Manual QA results and observations, checklist completion with actor/timestamps,
  and owner-only approval. Editors can record QA and complete checklist items.
- Readiness gates require mandatory items before entering QA, and passed manual QA
  plus mandatory items before approval. Owners can explicitly override with an
  audited reason, without falsifying checklist completion or QA results.
- Approved readiness is locked until explicitly reopened with a reason; reopening
  revokes approval and resets QA while retaining checklist completion.
- Manual, append-only deployment outcomes (succeeded, failed, cancelled, rollback),
  with start/completion times, recorder, source, build reference, report link and
  private notes/errors. Owners and editors may record outcomes for all environments.
- Reported current versions per environment are derived from successful outcomes
  and rollbacks ordered by completion time, then recording sequence for ties.
  Failed/cancelled or older backfilled outcomes do not replace newer successes.
- Explicit rollbacks restore a previously deployed version in the same environment.
  The source must match the reported version at that point in history; a reason
  is required. Rollback records do not erase prior deployments.
- Production readiness produces saved warnings, not recording restrictions.
  Successful deployment records freeze release content, without changing QA,
  lifecycle approval or public note publication.
- **One revocable public catalog URL per workspace**, listing all included
  applications with a URL-backed application filter. Individual release URLs
  remain inside that same catalog.
- Database-enforced authorization, unique application versions and append-only
  audit events. Public responses are explicitly serialized on the server.

Creating or publishing release notes does not claim that a release is deployed or
approved. Approval does not deploy or publish anything. Releases are created
manually; API keys, API-based creation, automated ingestion and E2E result tracking
are intentionally deferred.

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

`20261030210000_shiplog_manual_readiness.sql` has been applied to shared
Supabase with approval. It adds `shiplog_checklist_templates`, `shiplog_readiness` and
`shiplog_checklist_items`, with RLS and RPC-only writes. Existing releases get
empty revision-0 snapshots; future templates never retroactively change them.
Template saves use optimistic revision checks to prevent overwriting concurrent
edits.

`20261030220000_shiplog_manual_deployments.sql` adds the deployment ledger,
RLS-protected reported environment versions and the authorized recording RPC.
It has been applied to shared Supabase with approval. Existing releases do not receive invented
deployment history. The `first_deployed_at` field locks deployed release content.

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
Manual readiness is tested against the complete migration chain in PGlite and
with component tests. `manual-readiness.spec.ts` uses live Supabase to verify
template snapshots, QA gates, owner overrides, reopening, persisted approval and
public-data exclusion. Role restrictions also have database and component coverage.
`deployments.spec.ts` verifies live outcome recording, completion-time ordering,
environment isolation, rollback validation, content locks and private metadata
exclusion. Database tests additionally enforce viewer/outsider denial and the
append-only ledger; component tests cover save failures and read-only controls.

GitHub Actions follows the existing apps: pushes to `main` or `master` compile,
lint, format-check, test and build before GitHub Pages deployment. Configure
package Actions access or `UI_READ_TOKEN`, Supabase URL/publishable-key variables,
Pages and the Shiplog custom domain before deployment.

## Next vertical slices

1. Incidents, affected/fixed/verified versions and private attachments.
2. Jira email outbox, retries, notifications and comparison.

API keys, API-based release creation, automated ingestion and E2E result tracking
are out of the current manual-only scope.

The full product brief is the workspace-level `shiplog.md`; this initial
foundation deliberately does not pretend the later workflows are implemented.
