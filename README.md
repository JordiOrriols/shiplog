# Shiplog

Release history and communication on the same Supabase project and shared
`@jordiorriols/ui` package as Ladders, Planner and Pulse.

## Current vertical slice

- Shared Supabase accounts, production cross-subdomain sessions, email/GitHub
  login, signup and password recovery through UI.
- Existing workspace creation, switching and per-app owner/editor/viewer sharing.
- Editable applications with an optional link to an existing workspace team.
  A team may manage multiple applications; identifiers and platforms are removed.
  Catalog visibility is private by default, with initial staging and production
  environment records.
- Manual semantic-version releases with public notes. Major/minor/patch is
  inferred against the highest existing SemVer in the application, not insertion
  order (initial baseline `0.0.0`). Prerelease precedence and build metadata follow
  SemVer. Version edits exclude the edited release from the comparison.
- Editable, never-published drafts and categorized changes, private by default.
- Authenticated public previews using the same server projection and rendering
  as the public catalog; only explicitly public changes are included.
- Version/title and included changes are editable only on unpublished,
  undeployed drafts. First publication or successful deployment permanently locks
  those fields, even after unpublishing. Owners/editors can edit public notes at
  any time from release details, including on published/deployed releases;
  published changes are immediately reflected in the public catalog.
  Changes record private before/after audit history.
- Explicit publication/unpublication, independent of lifecycle and deployment.
- Owner-managed application checklist templates, snapshotted for each new release.
  Later template edits never alter existing release checklists.
- A simple **QA** tab shows passed checks and progress, with completion
  actor/timestamps. Owners/editors can check or uncheck items in any lifecycle.
- A separate **Approvals** tab lists current workspace members and each person's
  approved (green check), disapproved or pending decision. All Shiplog members,
  including viewers, can approve/disapprove only for themselves.
- Owners/editors manually choose the three release-list tags: **Draft**, **QA**
  and **Released**. QA checks and approvals do not automatically change status;
  there are no aggregate readiness gates, override forms or reopening actions.
- Manual, append-only deployment outcomes (succeeded, failed, cancelled, rollback),
  with start/completion times, recorder, source, build reference, report link and
  private notes/errors. Owners and editors may record outcomes for all environments.
- Reported current versions per environment are derived from successful outcomes
  and rollbacks ordered by completion time, then recording sequence for ties.
  Failed/cancelled or older backfilled outcomes do not replace newer successes.
- Explicit rollbacks restore a previously deployed version in the same environment.
  The source must match the reported version at that point in history; a reason
  is required. Rollback records do not erase prior deployments.
- Production readiness produces saved warnings, not recording restrictions:
  no current-member approval, any current-member disapproval, or incomplete
  mandatory checks. Pending members alone do not negate another member's approval.
  Removed members no longer affect warnings. Successful records lock version/
  change content without changing lifecycle, individual decisions or publication.
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

Shiplog uses UI `^0.3.19` from GitHub Packages, including the shared Shiplog
project registration, workspace sharing and authentication redirects.
Header, project-menu and login/welcome icons reuse the shared orange Shiplog
branding through `projectId` and `ProjectIcon`; no local palette is maintained.
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
deployment history. The `first_deployed_at` field locks version/title and
included changes, not public release notes.

`20261030230000_shiplog_simplify_management.sql` has been applied to shared
Supabase with explicit approval. It permanently removes application identifiers,
platforms and internal release notes, including their stored audit snapshot fields.
Existing `draft` statuses remain Draft; `released`, `deprecated` and `rolled_back`
become Released; other statuses become QA. Existing owner approvals become that
owner's individual decision. It adds optional workspace-team links and member
decisions, and replaces the old workflow RPCs. Historical QA observations and
audit history are retained privately, but the retired forms are no longer exposed.

`20261030231000_shiplog_member_identity.sql` has also been applied with approval.
It explicitly casts Supabase's `varchar` account email to the member RPC's `text`
return type. Database test fixtures use the same `varchar(255)` type as Supabase
to cover this integration detail.

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

Build and deployment run in separate jobs. Builds have only read permissions;
`UI_READ_TOKEN` is available only to dependency installation. Only the deployment
job receives Pages/OIDC permissions, on `main` or `master` and subject to the
`github-pages` environment's branch policy. Checkout credentials are not persisted.
Actions are pinned to commit SHAs and receive weekly Dependabot update PRs.

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
backfill. The full-chain simplification suite verifies destructive cleanup,
editable application teams, automatic version inference, published note updates,
manual status and member decisions. Browser tests compare draft preview and
anonymous catalog payloads to verify that private changes and QA/member/team
metadata never leak.
Browser tests live in the separate `e2e-tests` project under `tests/shiplog`.
Historical readiness migration tests explicitly stop before simplification;
current foundation, draft, checklist, approval and deployment behavior is tested
against the complete migration chain. `manual-readiness.spec.ts` uses live Supabase
to verify application editing/team reuse, QA completion, individual decisions,
manual status tags, published note updates and public-data exclusion.
Role restrictions also have database and component coverage.
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
