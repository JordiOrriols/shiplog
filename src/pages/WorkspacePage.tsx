import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import {
  AppSkeleton,
  Button,
  ConfirmDialog,
  EmptyState,
  Label,
  Modal,
} from "@jordiorriols/ui";
import { Plus, Rocket } from "@jordiorriols/ui/icons";
import { useAsyncAction } from "@jordiorriols/ui/hooks";
import { useWorkspaceData } from "@/data/useWorkspaceData";
import { useWorkspace } from "@/data/WorkspaceProvider";
import { useData } from "@/data/DataProvider";
import { type Release } from "@/lib/contracts";
import ReleaseDetails from "@/components/ReleaseDetails";
import {
  Field,
  TextField,
  ReleaseFields,
  releaseFormInput,
} from "@/components/ReleaseFields";

export default function WorkspacePage({
  section,
}: {
  section: "overview" | "applications" | "releases";
}) {
  const { t, i18n } = useTranslation();
  const { workspace } = useWorkspace();
  const { repository } = useData();
  const query = useWorkspaceData();
  const action = useAsyncAction();
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState("");
  const [publication, setPublication] = useState<Release | null>(null);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [publicDraft, setPublicDraft] = useState<{
    id: string;
    enabled: boolean;
  } | null>(null);
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
      {action.error && (
        <p role="alert" className="text-destructive">
          {action.error}
        </p>
      )}
      {section === "overview" && (
        <div className="grid gap-3 sm:grid-cols-3">
          {[
            ["releases.applicationCount", applications.length, "/applications"],
            ["releases.count", releases.length, "/releases"],
            [
              "releases.publishedCount",
              releases.filter((release) => release.published_at).length,
              "/portal",
            ],
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
                <span className="text-xs text-muted-foreground">
                  {t(`platforms.${app.platform}`)}
                </span>
              </div>
              <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                {app.description}
              </p>
              <p className="text-xs font-mono">{app.slug}</p>
              {canEdit ? (
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={
                      publicDraft?.id === app.id
                        ? publicDraft.enabled
                        : app.public_enabled
                    }
                    disabled={action.busy}
                    onChange={(event) => {
                      const enabled = event.target.checked;
                      setPublicDraft({ id: app.id, enabled });
                      void action.run(async () => {
                        try {
                          await repository.setPublic(app.id, enabled);
                          await query.refresh();
                        } finally {
                          setPublicDraft(null);
                        }
                      });
                    }}
                  />
                  {t("applications.public")}
                </label>
              ) : (
                <p className="text-sm">
                  {t(
                    app.public_enabled
                      ? "applications.public"
                      : "applications.private",
                  )}
                </p>
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
                    <p className="text-xs font-medium text-muted-foreground">
                      {names.get(release.application_id)}
                    </p>
                    <button
                      type="button"
                      className="text-left text-lg font-semibold hover:underline"
                      onClick={() => setDetailId(release.id)}
                    >
                      <span className="mr-3 font-mono text-brand">
                        {release.version}
                      </span>
                      {release.title}
                    </button>
                    <p className="text-xs text-muted-foreground">
                      {t(`statuses.${release.status}`)} ·{" "}
                      {t(`releaseTypes.${release.release_type}`)} ·{" "}
                      {date(release.created_at)}
                    </p>
                  </div>
                  {canEdit && (
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={action.busy}
                      onClick={() => setPublication(release)}
                    >
                      {t(
                        release.published_at
                          ? "releases.unpublish"
                          : "releases.publish",
                      )}
                    </Button>
                  )}
                </div>
                <p className="mt-3 text-xs text-muted-foreground">
                  {t(
                    release.published_at
                      ? "releases.published"
                      : "releases.draft",
                  )}
                </p>
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
      {open && (
        <CreateForm
          section={section === "applications" ? "applications" : "releases"}
          onClose={() => setOpen(false)}
        />
      )}
      {detail && (
        <ReleaseDetails
          key={detail.id}
          release={detail}
          canEdit={canEdit}
          onClose={() => setDetailId(null)}
        />
      )}
      <ConfirmDialog
        isOpen={!!publication}
        title={t(
          publication?.published_at ? "releases.unpublish" : "releases.publish",
        )}
        description={t(
          publication?.published_at
            ? "releases.confirmUnpublish"
            : "releases.publishDescription",
        )}
        confirmLabel={t(
          publication?.published_at ? "releases.unpublish" : "releases.publish",
        )}
        cancelLabel={t("common.cancel")}
        onCancel={() => {
          if (!action.busy) setPublication(null);
        }}
        onConfirm={() => {
          if (!publication || action.busy) return;
          void action.run(async () => {
            await repository.publishRelease(
              publication.id,
              !publication.published_at,
            );
            await query.refresh();
            setPublication(null);
          });
        }}
      />
    </div>
  );
}

function CreateForm({
  section,
  onClose,
}: {
  section: "applications" | "releases";
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const { workspace } = useWorkspace();
  const { repository } = useData();
  const query = useWorkspaceData();
  const action = useAsyncAction();
  const applications = query.data?.applications ?? [];
  return (
    <Modal
      isOpen
      title={t(
        section === "applications" ? "applications.new" : "releases.new",
      )}
      description={t(
        section === "applications"
          ? "applications.description"
          : "releases.description",
      )}
      onOpenChange={(value) => {
        if (!value && !action.busy) onClose();
      }}
      closeLabel={t("common.cancel")}
    >
      <form
        className="space-y-4"
        onSubmit={(event) => {
          event.preventDefault();
          if (action.busy || !repository || !workspace) return;
          const form = new FormData(event.currentTarget);
          const field = (name: string) => String(form.get(name) ?? "");
          const releaseInput = releaseFormInput(event.currentTarget);
          void action.run(async () => {
            if (section === "applications")
              await repository.createApplication(
                workspace.id,
                field("name"),
                field("slug"),
                field("platform"),
                field("description"),
              );
            else await repository.createRelease(releaseInput);
            await query.refresh();
            onClose();
          });
        }}
      >
        {section === "applications" ? (
          <>
            <Field name="name" label={t("common.name")} maxLength={120} />
            <Field
              name="slug"
              label={t("applications.slug")}
              pattern="[a-z0-9]+(-[a-z0-9]+)*"
              maxLength={80}
            />
            <Label htmlFor="platform">{t("applications.platform")}</Label>
            <select id="platform" name="platform" className="field">
              {["web", "ios", "android", "backend", "api", "other"].map(
                (item) => (
                  <option key={item} value={item}>
                    {t(`platforms.${item}`)}
                  </option>
                ),
              )}
            </select>
            <TextField
              name="description"
              label={t("common.description")}
              maxLength={4000}
            />
          </>
        ) : (
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
        )}
        {action.error && (
          <p role="alert" className="text-destructive">
            {action.error}
          </p>
        )}
        <Button type="submit" disabled={action.busy}>
          {t("common.create")}
        </Button>
      </form>
    </Modal>
  );
}
