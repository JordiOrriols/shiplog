import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import {
  AppSkeleton,
  Button,
  EmptyState,
  Label,
  Modal,
} from "@jordiorriols/ui";
import { Plus, Rocket } from "@jordiorriols/ui/icons";
import { useAsyncAction } from "@jordiorriols/ui/hooks";
import { useWorkspaceData } from "@/data/useWorkspaceData";
import { useWorkspace } from "@/data/WorkspaceProvider";
import { useData } from "@/data/DataProvider";
import { type Application } from "@/lib/contracts";
import ReleaseDetails from "@/components/ReleaseDetails";
import ChecklistTemplate from "@/components/ChecklistTemplate";
import ReleaseApprovals from "@/components/ReleaseApprovals";
import ApplicationForm from "@/components/ApplicationForm";
import { ReleaseFields, releaseFormInput } from "@/components/ReleaseFields";

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
  const canEdit =
    workspace?.access_level === "owner" || workspace?.access_level === "editor";
  if (query.isPending)
    return <AppSkeleton label={t("app.loading")} fullPage={false} />;
  if (query.error)
    return (
      <div role="alert">
        <p>{query.error.message}</p>
        <Button onClick={() => void query.refetch()}>
          {t("common.retry")}
        </Button>
      </div>
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
                {canEdit && (
                  <Button
                    size="sm"
                    variant="ghost"
                    aria-label={t("applications.editNamed", { name: app.name })}
                    onClick={() => setEditingApplication(app)}
                  >
                    {t("changes.edit")}
                  </Button>
                )}
              </div>
              <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                {app.description}
              </p>
              <p className="text-xs text-muted-foreground">
                {query.data.teams.find((team) => team.id === app.team_id)
                  ?.name ?? t("applications.noTeam")}
              </p>
              {workspace.access_level === "owner" && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setTemplateApplication(app)}
                >
                  {t("readiness.template")}
                </Button>
              )}
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
              <select
                aria-label={t("portal.filter")}
                className="field max-w-xs"
                value={filter}
                onChange={(event) => setFilter(event.target.value)}
              >
                <option value="">{t("common.allApps")}</option>
                {applications.map((app) => (
                  <option key={app.id} value={app.id}>
                    {app.name}
                  </option>
                ))}
              </select>
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
                  <ReleaseApprovals releaseId={release.id} />
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
        <CreateForm onClose={() => setOpen(false)} />
      )}
      {detail && (
        <ReleaseDetails
          key={detail.id}
          release={detail}
          canEdit={canEdit}
          onClose={() => setDetailId(null)}
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

function CreateForm({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation();
  const { workspace } = useWorkspace();
  const { repository } = useData();
  const query = useWorkspaceData();
  const action = useAsyncAction();
  const applications = query.data?.applications ?? [];
  return (
    <Modal
      isOpen
      title={t("releases.new")}
      description={t("releases.description")}
      onOpenChange={(value) => {
        if (!value && !action.busy) onClose();
      }}
      closeLabel={t("common.close")}
      footer={
        <Button type="submit" form="release-create-form" disabled={action.busy}>
          {t("common.save")}
        </Button>
      }
    >
      <form
        id="release-create-form"
        className="space-y-4"
        onSubmit={(event) => {
          event.preventDefault();
          if (action.busy || !repository || !workspace) return;
          const releaseInput = releaseFormInput(event.currentTarget);
          void action.run(async () => {
            await repository.createRelease(releaseInput);
            await query.refresh();
            onClose();
          });
        }}
      >
        <>
          <Label htmlFor="application_id">{t("common.application")}</Label>
          <select
            id="application_id"
            name="application_id"
            className="field"
            required
          >
            {applications.map((app) => (
              <option key={app.id} value={app.id}>
                {app.name}
              </option>
            ))}
          </select>
          <ReleaseFields />
        </>
        {action.error && (
          <p role="alert" className="text-destructive">
            {action.error}
          </p>
        )}
      </form>
    </Modal>
  );
}
