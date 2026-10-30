import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AppSkeleton,
  Button,
  ConfirmDialog,
  Label,
  Modal,
} from "@jordiorriols/ui";
import { useAsyncAction } from "@jordiorriols/ui/hooks";
import { useData } from "@/data/DataProvider";
import { useWorkspaceData } from "@/data/useWorkspaceData";
import {
  CHANGE_CATEGORIES,
  isEditableDraft,
  type Release,
  type ReleaseChange,
} from "@/lib/contracts";
import {
  Field,
  ReleaseFields,
  TextField,
  releaseFormInput,
} from "./ReleaseFields";
import PublicReleaseContent from "./PublicReleaseContent";
import ReleaseReadiness from "./ReleaseReadiness";
import ApplicationDeployments from "./ApplicationDeployments";
import ReleaseApprovals from "./ReleaseApprovals";

export default function ReleaseDetails({
  release,
  canEdit,
  onClose,
}: {
  release: Release;
  canEdit: boolean;
  onClose: () => void;
}) {
  const { t, i18n } = useTranslation();
  const { repository, user } = useData();
  const workspaceData = useWorkspaceData();
  const client = useQueryClient();
  const action = useAsyncAction();
  const [mode, setMode] = useState<
    "details" | "edit" | "preview" | "readiness" | "deployments" | "approvals"
  >("details");
  const [editingChange, setEditingChange] = useState<
    ReleaseChange | "new" | null
  >(null);
  const [deleting, setDeleting] = useState<ReleaseChange | null>(null);
  const editable = canEdit && isEditableDraft(release);
  const changesKey = ["shiplog-changes", user?.id, release.id];
  const previewKey = ["shiplog-preview", user?.id, release.id];
  const changes = useQuery({
    queryKey: changesKey,
    queryFn: () => {
      if (!repository) throw new Error(t("portal.unavailable"));
      return repository.listChanges(release.id);
    },
  });
  const preview = useQuery({
    queryKey: previewKey,
    enabled: mode === "preview",
    queryFn: () => {
      if (!repository) throw new Error(t("portal.unavailable"));
      return repository.previewRelease(release.id);
    },
  });
  async function refresh() {
    await Promise.all([
      workspaceData.refresh(),
      client.invalidateQueries({ queryKey: changesKey }),
      client.invalidateQueries({ queryKey: previewKey }),
    ]);
  }
  return (
    <Modal
      isOpen
      title={`${release.version} — ${release.title}`}
      description={t("releases.detail")}
      closeLabel={t("common.close")}
      onOpenChange={(open) => {
        if (!open && !action.busy) onClose();
      }}
    >
      <div className="max-h-[calc(100dvh-16rem)] space-y-5 overflow-y-auto">
        <div
          role="group"
          aria-label={t("releases.detail")}
          className="flex flex-wrap gap-2"
        >
          <Button
            size="sm"
            variant={mode === "details" ? "secondary" : "ghost"}
            aria-pressed={mode === "details"}
            disabled={action.busy}
            onClick={() => setMode("details")}
          >
            {t("releases.detail")}
          </Button>
          {editable && (
            <Button
              size="sm"
              variant={mode === "edit" ? "secondary" : "ghost"}
              aria-pressed={mode === "edit"}
              disabled={action.busy}
              onClick={() => setMode("edit")}
            >
              {t("releases.edit")}
            </Button>
          )}
          <Button
            size="sm"
            variant={mode === "readiness" ? "secondary" : "ghost"}
            aria-pressed={mode === "readiness"}
            disabled={action.busy}
            onClick={() => setMode("readiness")}
          >
            {t("simple.qa")}
          </Button>
          <Button
            size="sm"
            variant={mode === "approvals" ? "secondary" : "ghost"}
            aria-pressed={mode === "approvals"}
            disabled={action.busy}
            onClick={() => setMode("approvals")}
          >
            {t("simple.approvals")}
          </Button>
          <Button
            size="sm"
            variant={mode === "deployments" ? "secondary" : "ghost"}
            aria-pressed={mode === "deployments"}
            disabled={action.busy}
            onClick={() => setMode("deployments")}
          >
            {t("deployments.title")}
          </Button>
          <Button
            size="sm"
            variant={mode === "preview" ? "secondary" : "ghost"}
            aria-pressed={mode === "preview"}
            disabled={action.busy}
            onClick={() => setMode("preview")}
          >
            {t("releases.preview")}
          </Button>
        </div>
        {!isEditableDraft(release) && (
          <p className="text-xs text-muted-foreground">
            {t("releases.historyLocked")}
          </p>
        )}
        {action.error && (
          <p role="alert" className="text-sm text-destructive">
            {action.error}
          </p>
        )}
        {canEdit && (
          <label className="flex items-center gap-3 text-sm">
            {t("simple.status")}
            <select
              className="field max-w-40"
              aria-label={t("simple.status")}
              value={release.status}
              disabled={action.busy}
              onChange={(event) => {
                const status = event.target.value;
                if (
                  !repository ||
                  action.busy ||
                  (status !== "draft" &&
                    status !== "qa" &&
                    status !== "released")
                )
                  return;
                void action.run(async () => {
                  await repository.setReleaseStatus(release.id, status);
                  await workspaceData.refresh();
                });
              }}
            >
              {["draft", "qa", "released"].map((status) => (
                <option key={status} value={status}>
                  {t(`statuses.${status}`)}
                </option>
              ))}
            </select>
          </label>
        )}
        {mode === "approvals" ? (
          <ReleaseApprovals releaseId={release.id} />
        ) : mode === "deployments" ? (
          <ApplicationDeployments
            applicationId={release.application_id}
            canEdit={canEdit}
            initialReleaseId={release.id}
          />
        ) : mode === "readiness" ? (
          <ReleaseReadiness release={release} canEdit={canEdit} />
        ) : mode === "edit" && editable ? (
          <form
            className="space-y-4"
            onSubmit={(event) => {
              event.preventDefault();
              if (action.busy || !repository) return;
              const input = releaseFormInput(
                event.currentTarget,
                release.application_id,
              );
              void action.run(async () => {
                await repository.updateDraft(release.id, input);
                await refresh();
                setMode("details");
              });
            }}
          >
            <fieldset disabled={action.busy} className="space-y-4">
              <ReleaseFields initial={release} />
            </fieldset>
            <Button type="submit" disabled={action.busy}>
              {t("common.save")}
            </Button>
          </form>
        ) : mode === "preview" ? (
          <>
            <p className="text-xs text-muted-foreground">
              {t("releases.previewNotice")}
            </p>
            {preview.isPending ? (
              <AppSkeleton fullPage={false} label={t("common.loading")} />
            ) : preview.error ? (
              <div role="alert">
                <p>{preview.error.message}</p>
                <Button onClick={() => void preview.refetch()}>
                  {t("common.retry")}
                </Button>
              </div>
            ) : (
              <PublicReleaseContent release={preview.data} />
            )}
          </>
        ) : (
          <>
            <p className="text-sm text-muted-foreground">
              {t("releases.created", {
                date: new Intl.DateTimeFormat(i18n.language, {
                  dateStyle: "medium",
                }).format(new Date(release.created_at)),
              })}
            </p>
            {canEdit ? (
              <form
                key={release.public_notes}
                className="space-y-3"
                onSubmit={(event) => {
                  event.preventDefault();
                  if (!repository || action.busy) return;
                  const notes = String(
                    new FormData(event.currentTarget).get("public_notes") ?? "",
                  );
                  void action.run(async () => {
                    await repository.updatePublicNotes(release.id, notes);
                    await refresh();
                  });
                }}
              >
                <fieldset disabled={action.busy}>
                  <TextField
                    name="public_notes"
                    label={t("releases.public")}
                    maxLength={20000}
                    initial={release.public_notes}
                  />
                </fieldset>
                <p className="text-xs text-muted-foreground">
                  {t("releases.notesEditable")}
                </p>
                <Button type="submit" disabled={action.busy}>
                  {t("simple.saveNotes")}
                </Button>
              </form>
            ) : (
              <section>
                <h3 className="font-semibold">{t("releases.public")}</h3>
                <p className="mt-2 whitespace-pre-wrap break-words text-sm">
                  {release.public_notes || t("common.empty")}
                </p>
              </section>
            )}
            <section className="space-y-3">
              <div className="flex items-center justify-between gap-3">
                <h3 className="font-semibold">{t("changes.title")}</h3>
                {editable && (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={action.busy}
                    onClick={() => setEditingChange("new")}
                  >
                    {t("changes.add")}
                  </Button>
                )}
              </div>
              {changes.isPending ? (
                <AppSkeleton fullPage={false} label={t("common.loading")} />
              ) : changes.error ? (
                <div role="alert">
                  <p>{changes.error.message}</p>
                  <Button onClick={() => void changes.refetch()}>
                    {t("common.retry")}
                  </Button>
                </div>
              ) : changes.data.length ? (
                <ul className="divide-y divide-border">
                  {changes.data.map((change) => (
                    <li key={change.id} className="space-y-2 py-3">
                      <p className="text-xs text-muted-foreground">
                        {t(`changes.categories.${change.category}`)} ·{" "}
                        {t(
                          change.is_public
                            ? "changes.public"
                            : "changes.private",
                        )}
                      </p>
                      <p className="break-words text-sm font-medium">
                        {change.title}
                      </p>
                      <p className="whitespace-pre-wrap break-words text-sm text-muted-foreground">
                        {change.description}
                      </p>
                      {editable && (
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            variant="ghost"
                            disabled={action.busy}
                            aria-label={t("changes.editNamed", {
                              title: change.title,
                            })}
                            onClick={() => setEditingChange(change)}
                          >
                            {t("changes.edit")}
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            disabled={action.busy}
                            aria-label={t("changes.deleteNamed", {
                              title: change.title,
                            })}
                            onClick={() => setDeleting(change)}
                          >
                            {t("common.delete")}
                          </Button>
                        </div>
                      )}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-muted-foreground">
                  {t("changes.empty")}
                </p>
              )}
              {editable && editingChange && (
                <form
                  key={editingChange === "new" ? "new" : editingChange.id}
                  className="space-y-3 rounded-lg border border-border p-3"
                  onSubmit={(event) => {
                    event.preventDefault();
                    if (action.busy || !repository) return;
                    const form = new FormData(event.currentTarget);
                    const input = {
                      category: form.get("category"),
                      title: form.get("change_title"),
                      description: form.get("change_description"),
                      is_public: form.get("is_public") === "on",
                    };
                    const id =
                      editingChange === "new" ? undefined : editingChange.id;
                    void action.run(async () => {
                      await repository.saveChange(release.id, input, id);
                      await refresh();
                      setEditingChange(null);
                    });
                  }}
                >
                  <fieldset disabled={action.busy} className="space-y-3">
                    <Label htmlFor="category">{t("changes.category")}</Label>
                    <select
                      id="category"
                      name="category"
                      className="field"
                      defaultValue={
                        editingChange === "new"
                          ? "feature"
                          : editingChange.category
                      }
                    >
                      {CHANGE_CATEGORIES.map((category) => (
                        <option key={category} value={category}>
                          {t(`changes.categories.${category}`)}
                        </option>
                      ))}
                    </select>
                    <Field
                      name="change_title"
                      label={t("common.title")}
                      maxLength={160}
                      initial={
                        editingChange === "new" ? "" : editingChange.title
                      }
                    />
                    <TextField
                      name="change_description"
                      label={t("common.description")}
                      maxLength={10000}
                      initial={
                        editingChange === "new" ? "" : editingChange.description
                      }
                    />
                    <label className="flex items-center gap-2 text-sm">
                      <input
                        name="is_public"
                        type="checkbox"
                        defaultChecked={
                          editingChange !== "new" && editingChange.is_public
                        }
                      />
                      {t("changes.public")}
                    </label>
                  </fieldset>
                  <div className="flex gap-2">
                    <Button type="submit" disabled={action.busy}>
                      {t("common.save")}
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      disabled={action.busy}
                      onClick={() => setEditingChange(null)}
                    >
                      {t("common.cancel")}
                    </Button>
                  </div>
                </form>
              )}
            </section>
            <p className="text-xs text-muted-foreground">
              {t("releases.publicationNotice")}
            </p>
          </>
        )}
      </div>
      <ConfirmDialog
        isOpen={!!deleting}
        title={t("changes.deleteNamed", { title: deleting?.title ?? "" })}
        description={t("changes.deleteDescription")}
        confirmLabel={t("common.delete")}
        cancelLabel={t("common.cancel")}
        onCancel={() => {
          if (!action.busy) setDeleting(null);
        }}
        onConfirm={() => {
          if (!deleting || action.busy || !repository) return;
          void action.run(async () => {
            await repository.deleteChange(release.id, deleting.id);
            await refresh();
            setDeleting(null);
          });
        }}
      />
    </Modal>
  );
}
