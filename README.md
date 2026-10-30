# Shiplog

Release history and communication on the same Supabase project and shared
`@jordiorriols/ui` package as Ladders, Planner and Pulse.

## Current vertical slice

- Shared Supabase accounts, production cross-subdomain sessions, email/GitHub
  login, signup and password recovery through UI.
- Existing workspace creation, switching and per-app owner/editor/viewer sharing.
- Editable applications with an optional link to an existing workspace team.
  A team may manage multiple applications; identifiers and platforms are removed.
  Every application is automatically included when the workspace public catalog
  is enabled; there is no per-application visibility checkbox.
- Manual semantic-version releases with public notes. Major/minor/patch is
  inferred against the highest existing SemVer in the application, not insertion
  order (initial baseline `0.0.0`). Prerelease precedence and build metadata follow
  SemVer. Version edits exclude the edited release from the comparison.
- Release modals have **Details**, **Changes** and **QA** tabs. Details contains
  version/title, release notes and status, saved together from the modal footer.
- Version/title and feature links are editable in Draft status. Changes links
  multiple existing Planner features from the same workspace; both Shiplog edit
  access and Planner access are required. Detailed change descriptions belong in
  release notes, not separate categorized change records.
- Linked feature names are snapshotted when linked and shown publicly without
  Planner IDs, descriptions or private links. Renames do not silently change a
  release's public text; unlink/relink to refresh a name. Deleting a Planner
  feature removes its release links.
- Owners/editors can edit public notes in every status. All releases, including
  Draft and QA, appear automatically when the workspace catalog is enabled.
  Edits appear immediately and are audited.
- Forms use the shared modal footer: black primary Save and secondary Close,
  rather than submission buttons inside the content. Application tags reuse
  Planner's estimation-card styling.
- Owner-managed application checklist templates, snapshotted for each new release.
  Later template edits never alter existing release checklists.
- A simple **QA** tab shows passed checks and progress, with completion
  actor/timestamps. Owners/editors can check or uncheck items in any lifecycle.
- Each release card has thumbs-up/down approval buttons and right-aligned member
  decision badges. Unselected thumbs are gray; selected approval is green and
  selected disapproval red. All Shiplog members, including viewers, can decide only
  for themselves. Labels use UI's `getDisplayName`: linked workspace member name,
  account name, then email local part; application-team names take precedence
  when the account belongs to several teams.
- All form/filter dropdowns use UI's `SelectField`, including workspace sharing
  and anonymous release catalogs, rather than browser-native select popups.
- Owners/editors manually choose the three release-list tags: **Draft**, **QA**
  and **Released**. QA checks and approvals do not automatically change status;
  the status control appears only on the first release-details tab. There are no
  aggregate readiness gates, deployment records, publication actions or preview tab.
- **One revocable public catalog URL per workspace**, listing all
  applications with a URL-backed application filter. Individual release URLs
  remain inside that same catalog. Open workspace **Share**: **Emails** is the
  default tab for people access and **Link** contains public catalog controls.
  Owners alone manage people and enable/revoke links;
  Shiplog editors/viewers see current-app access and can copy/open existing links.
  The former `/portal` management route redirects to the overview.
- Database-enforced authorization, unique application versions and append-only
  audit events. Public responses are explicitly serialized on the server.

Release status and individual approval decisions are independent. Releases are created
manually; API keys, API-based creation, automated ingestion and E2E result tracking
are intentionally deferred.

## Local development

Use Node.js 26 LTS with npm 11.20.0. Run `nvm install && nvm use` to select
the `.nvmrc` version used by CI and deployment.

Shiplog uses UI `^0.3.22` from GitHub Packages, including the shared Shiplog
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

`20261030234000_workspace_sharing_directory.sql` (also tracked identically in
Planner) and `20261030235000_shiplog_sharing_permissions.sql` have been applied
once to the shared database with approval. They authorize current-app editor/viewer directory and token reads
while restricting public-link writes to owners. Anonymous, other-app and
linked-team-only access cannot read the directory.

Migrations preceding `20261030190000_shiplog_core.sql` are the shared project's
existing history, copied so a clean test database applies the real migrations
in order without requiring a sibling checkout. They must not be re-applied
manually against an existing project.

The Shiplog migration extends workspace app validation and adds:

- `shiplog_applications`
- `shiplog_releases`, `shiplog_release_features`
- `shiplog_audit_events`, `shiplog_portals`

Internal tables have RLS and authenticated read grants. Mutations go through
transactional, explicitly authorized RPCs. Anonymous users cannot query internal
tables. `shiplog_public_catalog(token)` returns all workspace application names
and allow-listed release fields for every status. Catalog tokens are opaque and revocable; they are
shareable links, not an account permission.

`20261031000000_shiplog_planner_features.sql` consolidates release detail saves,
adds authorized same-workspace Planner feature linking and changes the public
projection to name-only features. It copies legacy public changes into release
notes in creation order, removes internal changes and retired change audit events,
then drops the old change table/RPCs. If conversion would exceed the 20,000-character
notes limit, the migration stops rather than truncating data. QA and approvals are
preserved. This destructive migration has been tested and applied to the shared
database with explicit approval.

`20261031001000_shiplog_approval_names.sql` and
`20261031002000_shiplog_approval_name_compatibility.sql` add same-workspace member
and account names to the authorized approval directory, without changing votes.
The legacy `name` field remains readable by deployed clients; new clients resolve
`member_name`, `account_name` and `email` through UI's shared helper. Other-app,
anonymous and outsider requests remain denied. Both migrations have been tested
and applied to the shared database with approval.

`20261030200000_shiplog_draft_content.sql` originally added the draft/change RPCs and the
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

`20261030232000_shiplog_release_only.sql` retires deployment/environment tables,
their recording RPC/view and audit records, publication timestamps/actions and
the authenticated preview RPC. It strips retired timestamps from release audit
snapshots, while preserving releases, QA snapshots, member decisions and
application privacy. The public projection now includes status and creation date,
and includes Draft, QA and Released automatically. Draft content editing depends
only on current status, so explicitly returning a release to Draft allows editing.
This destructive migration has been tested and applied to shared Supabase with
explicit approval.

`20261030233000_shiplog_all_applications_catalog.sql` removes per-application
inclusion from the public projection and retires the visibility RPC. Existing
applications (even previously excluded ones) and future applications appear
automatically, but only through an enabled workspace catalog token. Internal
changes, QA and member data remain excluded. The obsolete `public_enabled` column,
visibility audit events and visibility fields in application audit snapshots are
permanently removed. This migration has been tested and applied to shared
Supabase with explicit approval.

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
SemVer constraints, default release visibility, catalog projection and revocation.
Historical foundation/draft/readiness/simplification tests stop before the
migrations that retire their workflows. The release-only suite applies the full
chain to populated legacy data and verifies destructive cleanup, application
creation without environments, all three public statuses, status-only draft
editing, note updates, member decisions and permission/privacy boundaries.
Browser tests live in the separate `e2e-tests` project under `tests/shiplog`.
`manual-readiness.spec.ts` uses live Supabase
to verify application editing/team reuse, QA completion, individual decisions,
manual status tags, note updates and public-data exclusion. `releases.spec.ts`
covers footer form submission, neutral primary styling, application filters,
draft change CRUD, public statuses, safe serialization, catalog revocation and
mobile modal actions. Role restrictions also have database and component coverage.

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
