import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import {
  AppSkeleton,
  Button,
  ConfirmDialog,
  EmptyState,
  ErrorState,
  SelectField,
} from "@jordiorriols/ui";
import {
  ClipboardCheck,
  Pencil,
  Plus,
  Rocket,
  Trash2,
} from "@jordiorriols/ui/icons";
import { useAsyncAction } from "@jordiorriols/ui/hooks";
import { useWorkspaceData } from "@/data/useWorkspaceData";
import { useWorkspace } from "@/data/WorkspaceProvider";
import { useData } from "@/data/DataProvider";
import { type Application } from "@/lib/contracts";
import { localizeError } from "@/lib/localizeError";
import ReleaseDetails from "@/components/ReleaseDetails";
import ChecklistTemplate from "@/components/ChecklistTemplate";
import ReleaseApprovals from "@/components/ReleaseApprovals";
import ApplicationForm from "@/components/ApplicationForm";
import ReleaseQA from "@/components/ReleaseQA";

export default function WorkspacePage({
  section,
}: {
  section: "overview" | "applications" | "releases";
}) {
  const { t, i18n } = useTranslation();
  const { workspace } = useWorkspace();
  const { repository } = useData();
  const query = useWorkspaceData();
  const [open, setOpen] = useState(false);
  const [editingApplication, setEditingApplication] =
    useState<Application | null>(null);
  const [filter, setFilter] = useState("");
  const [detailId, setDetailId] = useState<string | null>(null);
  const [templateApplication, setTemplateApplication] =
    useState<Application | null>(null);
  const [deletingApplication, setDeletingApplication] =
    useState<Application | null>(null);
  const deletion = useAsyncAction();
  const canEdit =
    workspace?.access_level === "owner" || workspace?.access_level === "editor";
  if (query.isPending)
    return <AppSkeleton label={t("app.loading")} fullPage={false} />;
  if (query.error)
    return (
      <ErrorState
        message={localizeError(query.error.message)}
        onRetry={() => void query.refetch()}
        retryLabel={t("common.retry")}
      />
    );
  if (!workspace || !repository || !query.data) return null;
  const { applications, releases } = query.data;
  const detail = releases.find((release) => release.id === detailId);
  const names = new Map(applications.map((app) => [app.id, app.name]));
  const visible = releases.filter(
    (release) => !filter || release.application_id === filter,
  );
  const date = (value: string) =>
    new Intl.DateTimeFormat(i18n.language, { dateStyle: "medium" }).format(
      new Date(value),
    );
  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            {t(`sections.${section}`)}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {t(
              section === "applications"
                ? "applications.description"
                : "releases.description",
            )}
          </p>
        </div>
        {canEdit && section !== "overview" && (
          <Button
            onClick={() => setOpen(true)}
            disabled={section === "releases" && !applications.length}
          >
            <Plus className="size-4" />
            {t(
              section === "applications" ? "applications.new" : "releases.new",
            )}
          </Button>
        )}
      </header>
      {!canEdit && (
        <p className="text-sm text-muted-foreground">{t("common.readOnly")}</p>
      )}
      {section === "overview" && (
        <div className="grid gap-3 sm:grid-cols-3">
          {[
            ["releases.applicationCount", applications.length, "/applications"],
            ["releases.count", releases.length, "/releases"],
            ["releases.publicCount", releases.length, "/portal"],
          ].map(([label, count, path]) => (
            <Link
              className="panel hover:border-brand"
              key={label}
              to={String(path)}
            >
              <div className="text-3xl font-semibold tabular-nums">{count}</div>
              <div className="mt-2 text-sm text-muted-foreground">
                {t(String(label), { count: Number(count) })}
              </div>
            </Link>
          ))}
        </div>
      )}
      {section === "applications" ? (
        <div className="grid gap-4 md:grid-cols-2">
          {applications.map((app) => (
            <article key={app.id} className="panel space-y-3">
              <div className="flex items-start justify-between gap-2">
                <h2 className="text-lg font-semibold">{app.name}</h2>
                <div className="flex items-center gap-1">
                  {canEdit && (
                    <>
                      <Button
                        size="icon-sm"
                        variant="ghost"
                        aria-label={t("applications.editNamed", {
                          name: app.name,
                        })}
                        onClick={() => setEditingApplication(app)}
                      >
                        <Pencil className="size-4" aria-hidden="true" />
                      </Button>
                      <Button
                        size="icon-sm"
                        variant="ghost"
                        aria-label={t("applications.deleteNamed", {
                          name: app.name,
                        })}
                        tooltip={
                          releases.some(
                            (release) => release.application_id === app.id,
                          )
                            ? t("applications.hasReleases")
                            : t("applications.deleteNamed", { name: app.name })
                        }
                        disabled={
                          deletion.busy ||
                          releases.some(
                            (release) => release.application_id === app.id,
                          )
                        }
                        className="text-destructive hover:text-destructive"
                        onClick={() => {
                          deletion.reset();
                          setDeletingApplication(app);
                        }}
                      >
                        <Trash2 className="size-4" aria-hidden="true" />
                      </Button>
                    </>
                  )}
                  {workspace.access_level === "owner" && (
                    <Button
                      size="icon-sm"
                      variant="ghost"
                      aria-label={t("readiness.templateTitle", {
                        name: app.name,
                      })}
                      onClick={() => setTemplateApplication(app)}
                    >
                      <ClipboardCheck className="size-4" aria-hidden="true" />
                    </Button>
                  )}
                </div>
              </div>
              <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                {app.description}
              </p>
              <span
                className="inline-flex rounded-md bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground"
                data-testid="application-team"
              >
                {query.data.teams.find((team) => team.id === app.team_id)
                  ?.name ?? t("applications.noTeam")}
              </span>
            </article>
          ))}
          {!applications.length && (
            <EmptyState
              icon={<Rocket />}
              title={t("common.empty")}
              description={t("applications.description")}
            />
          )}
          <p className="text-xs text-muted-foreground md:col-span-2">
            {t("applications.hint")}
          </p>
        </div>
      ) : (
        <section className="space-y-4">
          {section === "overview" ? (
            <h2 className="font-semibold">{t("releases.recent")}</h2>
          ) : (
            <label className="flex items-center gap-3 text-sm">
              {t("portal.filter")}
              <SelectField
                aria-label={t("portal.filter")}
                className="max-w-xs"
                value={filter}
                onValueChange={setFilter}
                options={[
                  { value: "", label: t("common.allApps") },
                  ...applications.map((app) => ({
                    value: app.id,
                    label: app.name,
                  })),
                ]}
              />
            </label>
          )}
          {(section === "overview" ? visible.slice(0, 5) : visible).map(
            (release) => (
              <article className="panel" key={release.id}>
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="space-y-2">
                    <button
                      type="button"
                      className="flex flex-wrap items-center gap-2 text-left text-lg font-semibold hover:underline"
                      onClick={() => setDetailId(release.id)}
                    >
                      <span className="shrink-0 rounded-md bg-brand/10 px-2 py-0.5 text-[11px] font-medium tracking-normal text-brand">
                        {names.get(release.application_id)}
                      </span>
                      <span className="font-mono text-brand">
                        {release.version}
                      </span>
                      {release.title}
                    </button>
                    <p className="text-xs text-muted-foreground">
                      <span
                        className={`inline-flex rounded-full px-2 py-0.5 font-medium ${release.status === "released" ? "bg-green-100 text-green-800" : release.status === "qa" ? "bg-amber-100 text-amber-800" : "bg-muted text-muted-foreground"}`}
                      >
                        {t(`statuses.${release.status}`)}
                      </span>{" "}
                      · {t(`releaseTypes.${release.release_type}`)} ·{" "}
                      {date(release.created_at)}
                    </p>
                  </div>
                  <ReleaseApprovals
                    releaseId={release.id}
                    qa={<ReleaseQA release={release} canEdit={canEdit} />}
                  />
                </div>
              </article>
            ),
          )}
          {!visible.length && (
            <EmptyState
              icon={<Rocket />}
              title={t("common.empty")}
              description={t(
                applications.length
                  ? "releases.description"
                  : "releases.noApplications",
              )}
            />
          )}
        </section>
      )}
      {(editingApplication || (open && section === "applications")) && (
        <ApplicationForm
          {...(editingApplication ? { application: editingApplication } : {})}
          onClose={() => {
            setEditingApplication(null);
            setOpen(false);
          }}
        />
      )}
      {open && section !== "applications" && (
        <ReleaseDetails canEdit={canEdit} onClose={() => setOpen(false)} />
      )}
      {detail && (
        <ReleaseDetails
          key={detail.id}
          release={detail}
          canEdit={canEdit}
          onClose={() => setDetailId(null)}
        />
      )}
      {deletion.error && <ErrorState message={localizeError(deletion.error)} />}
      {deletingApplication && (
        <ConfirmDialog
          isOpen
          title={t("applications.deleteNamed", {
            name: deletingApplication.name,
          })}
          description={t("applications.deleteConfirm", {
            name: deletingApplication.name,
          })}
          confirmLabel={t("common.delete")}
          cancelLabel={t("common.close")}
          onCancel={() => {
            if (!deletion.busy) setDeletingApplication(null);
          }}
          onConfirm={() => {
            if (deletion.busy) return;
            void deletion.run(async () => {
              await repository.deleteApplication(deletingApplication.id);
              await query.refresh();
              setDeletingApplication(null);
            });
          }}
        />
      )}
      {templateApplication && (
        <ChecklistTemplate
          application={templateApplication}
          onClose={() => setTemplateApplication(null)}
        />
      )}
    </div>
  );
}
