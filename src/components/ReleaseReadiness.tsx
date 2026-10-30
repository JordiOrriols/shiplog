import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AppSkeleton, Button, Label } from "@jordiorriols/ui";
import { useAsyncAction } from "@jordiorriols/ui/hooks";
import { useData } from "@/data/DataProvider";
import { useWorkspace } from "@/data/WorkspaceProvider";
import { useWorkspaceData } from "@/data/useWorkspaceData";
import {
  QA_STATUSES,
  type Release,
  type ReadinessTransition,
} from "@/lib/contracts";
import { TextField } from "./ReleaseFields";

export default function ReleaseReadiness({
  release,
  canEdit,
}: {
  release: Release;
  canEdit: boolean;
}) {
  const { t, i18n } = useTranslation();
  const { repository, user } = useData();
  const { workspace } = useWorkspace();
  const client = useQueryClient();
  const workspaceData = useWorkspaceData();
  const action = useAsyncAction();
  const [pendingItem, setPendingItem] = useState<{
    id: string;
    completed: boolean;
  } | null>(null);
  const [transition, setTransition] = useState<ReadinessTransition | null>(
    null,
  );
  const key = ["shiplog-readiness", user?.id, release.id];
  const query = useQuery({
    queryKey: key,
    queryFn: () => {
      if (!repository) throw new Error(t("portal.unavailable"));
      return repository.readiness(release.id);
    },
  });
  async function refresh() {
    await Promise.all([
      workspaceData.refresh(),
      client.invalidateQueries({ queryKey: key }),
    ]);
  }
  if (query.isPending)
    return <AppSkeleton fullPage={false} label={t("common.loading")} />;
  if (query.error)
    return (
      <div role="alert">
        <p>{query.error.message}</p>
        <Button onClick={() => void query.refetch()}>
          {t("common.retry")}
        </Button>
      </div>
    );
  const data = query.data;
  const owner = workspace?.access_level === "owner";
  const mutable =
    canEdit &&
    ["draft", "ready_for_qa", "qa_in_progress", "qa_passed"].includes(
      release.status,
    );
  const missing = data.items.filter(
    (item) => item.mandatory && !item.completed_at,
  ).length;
  const completed = data.items.filter((item) => item.completed_at).length;
  const date = (value: string) =>
    new Intl.DateTimeFormat(i18n.language, {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(value));
  return (
    <div className="space-y-5">
      <p className="text-sm text-muted-foreground">
        {t("readiness.manualNotice")}
      </p>
      <section className="space-y-3">
        <h3 className="font-semibold">{t("readiness.checklist")}</h3>
        <p className="text-sm">
          {t("readiness.progress", {
            completed,
            total: data.items.length,
            missing,
          })}
        </p>
        <progress
          className="h-2 w-full accent-brand"
          aria-label={t("readiness.checklist")}
          max={data.items.length || 1}
          value={completed}
        />
        <p className="text-xs text-muted-foreground">
          {t("readiness.revision", { revision: data.template_revision })}
        </p>
        {!data.items.length && (
          <p className="text-sm">{t("readiness.noSnapshot")}</p>
        )}
        <ul className="divide-y divide-border">
          {data.items.map((item) => (
            <li key={item.id} className="space-y-2 py-3">
              <p className="text-xs text-muted-foreground">
                {item.category} ·{" "}
                {t(
                  item.mandatory ? "readiness.mandatory" : "readiness.optional",
                )}
              </p>
              <label className="flex items-start gap-2 text-sm font-medium">
                <input
                  type="checkbox"
                  className="mt-1"
                  disabled={!mutable || action.busy}
                  checked={
                    pendingItem?.id === item.id
                      ? pendingItem.completed
                      : !!item.completed_at
                  }
                  onChange={(event) => {
                    if (!repository) return;
                    const checked = event.target.checked;
                    setPendingItem({ id: item.id, completed: checked });
                    void action.run(async () => {
                      try {
                        await repository.completeChecklistItem(
                          release.id,
                          item.id,
                          checked,
                        );
                        await refresh();
                      } finally {
                        setPendingItem(null);
                      }
                    });
                  }}
                />
                <span className="break-words">{item.title}</span>
              </label>
              {item.description && (
                <p className="text-sm whitespace-pre-wrap break-words">
                  {item.description}
                </p>
              )}
              {item.completed_at && (
                <p className="text-xs text-muted-foreground">
                  {t("readiness.recorded", {
                    actor: item.completed_by ?? t("readiness.deletedAccount"),
                    date: date(item.completed_at),
                  })}
                </p>
              )}
            </li>
          ))}
        </ul>
      </section>
      <section className="space-y-3">
        <h3 className="font-semibold">{t("readiness.qa")}</h3>
        <p className="text-sm font-medium">
          {t(`readiness.qaStatuses.${data.qa_status}`)}
        </p>
        {data.qa_notes && (
          <p className="whitespace-pre-wrap break-words text-sm">
            {data.qa_notes}
          </p>
        )}
        {data.qa_recorded_at && (
          <p className="text-xs text-muted-foreground">
            {t("readiness.recorded", {
              actor: data.qa_recorded_by ?? t("readiness.deletedAccount"),
              date: date(data.qa_recorded_at),
            })}
          </p>
        )}
        {mutable && release.status !== "draft" && (
          <form
            key={data.qa_recorded_at}
            className="space-y-3"
            onSubmit={(event) => {
              event.preventDefault();
              if (action.busy || !repository) return;
              const form = new FormData(event.currentTarget);
              const input = {
                qa_status: form.get("qa_status"),
                notes: form.get("qa_notes"),
              };
              void action.run(async () => {
                await repository.recordManualQa(release.id, input);
                await refresh();
              });
            }}
          >
            <fieldset disabled={action.busy} className="space-y-3">
              <Label htmlFor="qa_status">{t("readiness.qaStatus")}</Label>
              <select
                className="field"
                id="qa_status"
                name="qa_status"
                defaultValue={data.qa_status}
              >
                {QA_STATUSES.map((status) => (
                  <option key={status} value={status}>
                    {t(`readiness.qaStatuses.${status}`)}
                  </option>
                ))}
              </select>
              <TextField
                name="qa_notes"
                label={t("readiness.qaNotes")}
                maxLength={10000}
                initial={data.qa_notes}
              />
            </fieldset>
            <Button type="submit" disabled={action.busy}>
              {t("readiness.saveQa")}
            </Button>
          </form>
        )}
      </section>
      {data.approved_at && (
        <section className="space-y-2 rounded-lg border border-border p-3">
          <h3 className="font-semibold">{t("statuses.approved")}</h3>
          <p className="text-xs text-muted-foreground">
            {t("readiness.recorded", {
              actor: data.approved_by ?? t("readiness.deletedAccount"),
              date: date(data.approved_at),
            })}
          </p>
          {data.approval_override_reason && (
            <p className="whitespace-pre-wrap break-words text-sm">
              {t("readiness.overrideRecorded", {
                reason: data.approval_override_reason,
              })}
            </p>
          )}
        </section>
      )}
      {action.error && (
        <p role="alert" className="text-sm text-destructive">
          {action.error}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        {canEdit && release.status === "draft" && (
          <Button
            disabled={action.busy}
            onClick={() => setTransition("ready_for_qa")}
          >
            {t("readiness.actions.ready_for_qa")}
          </Button>
        )}
        {owner &&
          ["ready_for_qa", "qa_in_progress", "qa_passed"].includes(
            release.status,
          ) && (
            <Button
              disabled={action.busy}
              onClick={() => setTransition("approved")}
            >
              {t("readiness.actions.approved")}
            </Button>
          )}
        {canEdit && release.status === "approved" && (
          <Button
            variant="outline"
            disabled={action.busy}
            onClick={() => setTransition("reopen_qa")}
          >
            {t("readiness.actions.reopen_qa")}
          </Button>
        )}
      </div>
      {transition && (
        <form
          key={transition}
          className="space-y-3 rounded-lg border border-border p-3"
          onSubmit={(event) => {
            event.preventDefault();
            if (action.busy || !repository) return;
            const reason = String(
              new FormData(event.currentTarget).get("transition_reason") ?? "",
            );
            void action.run(async () => {
              await repository.transitionReadiness(
                release.id,
                transition,
                reason,
              );
              await refresh();
              setTransition(null);
            });
          }}
        >
          <p className="font-medium">{t(`readiness.actions.${transition}`)}</p>
          <p className="text-sm text-muted-foreground">
            {t(
              transition === "reopen_qa"
                ? "readiness.reopenNotice"
                : "readiness.gateNotice",
            )}
          </p>
          {transition !== "reopen_qa" && (
            <p className="text-sm">
              {t("readiness.blockers", {
                missing,
                qa: t(`readiness.qaStatuses.${data.qa_status}`),
              })}
            </p>
          )}
          <fieldset disabled={action.busy} className="space-y-3">
            {(owner || transition === "reopen_qa") && (
              <TextField
                name="transition_reason"
                label={t(
                  transition === "reopen_qa"
                    ? "readiness.reopenReason"
                    : "readiness.overrideReason",
                )}
                maxLength={4000}
              />
            )}
          </fieldset>
          <div className="flex gap-2">
            <Button type="submit" disabled={action.busy}>
              {t("readiness.confirm")}
            </Button>
            <Button
              type="button"
              variant="ghost"
              disabled={action.busy}
              onClick={() => setTransition(null)}
            >
              {t("common.cancel")}
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}
