import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AppSkeleton,
  Button,
  Label,
  Modal,
  SelectField,
} from "@jordiorriols/ui";
import { Plus, X } from "@jordiorriols/ui/icons";
import { useAsyncAction } from "@jordiorriols/ui/hooks";
import { useData } from "@/data/DataProvider";
import { useWorkspace } from "@/data/WorkspaceProvider";
import { useWorkspaceData } from "@/data/useWorkspaceData";
import { isEditableDraft, type Release } from "@/lib/contracts";
import { localizeError } from "@/lib/localizeError";
import { ReleaseFields, releaseFormInput } from "./ReleaseFields";

export default function ReleaseDetails({
  release,
  canEdit,
  onClose,
}: {
  release?: Release;
  canEdit: boolean;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const { repository, user } = useData();
  const { workspace } = useWorkspace();
  const workspaceData = useWorkspaceData();
  const client = useQueryClient();
  const action = useAsyncAction();
  const [selected, setSelected] = useState("");
  const [featureIds, setFeatureIds] = useState<string[] | null>(null);
  const editable = canEdit && (!release || isEditableDraft(release));
  const featuresKey = ["shiplog-features", user?.id, release?.id];
  const features = useQuery({
    queryKey: featuresKey,
    enabled: !!release,
    queryFn: () => {
      if (!repository || !release) throw new Error(t("portal.unavailable"));
      return repository.releaseFeatures(release.id);
    },
  });
  const candidates = useQuery({
    queryKey: ["shiplog-workspace-features", user?.id, workspace?.id],
    enabled: editable && !!workspace,
    queryFn: () => {
      if (!repository || !workspace) throw new Error(t("portal.unavailable"));
      return repository.workspaceFeatures(workspace.id);
    },
  });
  const linked = features.data ?? [];
  const ids = featureIds ?? linked.map((feature) => feature.id);
  const names = new Map(
    [...(candidates.data ?? []), ...linked].map((feature) => [
      feature.id,
      feature.name,
    ]),
  );
  const applications = workspaceData.data?.applications ?? [];
  const loading = !!release && features.isPending;
  return (
    <Modal
      isOpen
      title={
        release ? `${release.version} — ${release.title}` : t("releases.new")
      }
      description={t("releases.detail")}
      closeLabel={t("common.close")}
      onOpenChange={(open) => {
        if (!open && !action.busy) onClose();
      }}
      footer={
        canEdit && (
          <Button
            type="submit"
            form="release-configuration-form"
            disabled={action.busy || loading || !!features.error}
          >
            {t("common.save")}
          </Button>
        )
      }
    >
      <form
        id="release-configuration-form"
        key={`${release?.id}-${release?.status}-${release?.public_notes}`}
        className="space-y-5"
        onSubmit={(event) => {
          event.preventDefault();
          if (
            !repository ||
            action.busy ||
            !canEdit ||
            loading ||
            features.error
          )
            return;
          const input = releaseFormInput(
            event.currentTarget,
            release?.application_id,
          );
          const status = String(
            new FormData(event.currentTarget).get("status"),
          );
          void action.run(async () => {
            await repository.saveConfiguration(
              input,
              status,
              featureIds,
              release?.id ?? null,
            );
            await Promise.all([
              workspaceData.refresh(),
              client.invalidateQueries({ queryKey: featuresKey }),
            ]);
            setFeatureIds(null);
            if (!release) onClose();
          });
        }}
      >
        <fieldset disabled={action.busy || !canEdit} className="space-y-4">
          {!release && (
            <div className="space-y-1">
              <Label htmlFor="application_id">{t("common.application")}</Label>
              <SelectField
                id="application_id"
                name="application_id"
                defaultValue={applications[0]?.id ?? ""}
                required
                options={applications.map((app) => ({
                  value: app.id,
                  label: app.name,
                }))}
              />
            </div>
          )}
          <ReleaseFields
            {...(release ? { initial: release } : {})}
            draftEditable={editable}
          />
          <div className="space-y-1">
            <Label htmlFor="release-status">{t("simple.status")}</Label>
            <SelectField
              id="release-status"
              name="status"
              defaultValue={release?.status ?? "draft"}
              options={["draft", "qa", "released"].map((status) => ({
                value: status,
                label: t(`statuses.${status}`),
              }))}
            />
          </div>
        </fieldset>
        {release && !isEditableDraft(release) && (
          <p className="text-xs text-muted-foreground">
            {t("releases.historyLocked")}
          </p>
        )}
        <section className="space-y-3 border-t border-border pt-4">
          <h3 className="font-semibold">{t("featureLinks.changes")}</h3>
          <p className="text-sm text-muted-foreground">
            {t("featureLinks.description")}
          </p>
          {loading ? (
            <AppSkeleton fullPage={false} label={t("common.loading")} />
          ) : features.error ? (
            <div role="alert">
              <p>{localizeError(features.error.message)}</p>
              <Button
                type="button"
                variant="outline"
                onClick={() => void features.refetch()}
              >
                {t("common.retry")}
              </Button>
            </div>
          ) : (
            <>
              {editable && candidates.error && (
                <div role="alert">
                  <p>{localizeError(candidates.error.message)}</p>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => void candidates.refetch()}
                  >
                    {t("common.retry")}
                  </Button>
                </div>
              )}
              {editable && !candidates.error && (
                <div className="space-y-1">
                  <Label htmlFor="planner-feature">
                    {t("featureLinks.feature")}
                  </Label>
                  <div className="flex items-center gap-2">
                    <SelectField
                      id="planner-feature"
                      value={selected}
                      disabled={action.busy || candidates.isPending}
                      onValueChange={setSelected}
                      options={[
                        { value: "", label: t("featureLinks.select") },
                        ...(candidates.data ?? [])
                          .filter((feature) => !ids.includes(feature.id))
                          .map((feature) => ({
                            value: feature.id,
                            label: feature.name,
                          })),
                      ]}
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="icon-sm"
                      aria-label={t("featureLinks.link")}
                      disabled={
                        action.busy || !selected || candidates.isPending
                      }
                      onClick={() => {
                        setFeatureIds([...ids, selected]);
                        setSelected("");
                      }}
                    >
                      <Plus className="size-4" aria-hidden="true" />
                    </Button>
                  </div>
                </div>
              )}
              {ids.length ? (
                <ul className="divide-y divide-border">
                  {ids.map((id) => (
                    <li
                      key={id}
                      className="flex items-center justify-between gap-3 py-2"
                    >
                      <span className="break-words text-sm font-medium">
                        {names.get(id)}
                      </span>
                      {editable && candidates.isSuccess && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-sm"
                          aria-label={t("featureLinks.unlinkNamed", {
                            name: names.get(id),
                          })}
                          disabled={action.busy}
                          onClick={() =>
                            setFeatureIds(ids.filter((value) => value !== id))
                          }
                        >
                          <X className="size-4" aria-hidden="true" />
                        </Button>
                      )}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-muted-foreground">
                  {t("featureLinks.empty")}
                </p>
              )}
            </>
          )}
        </section>
        {action.error && (
          <p role="alert" className="text-sm text-destructive">
            {localizeError(action.error)}
          </p>
        )}
      </form>
    </Modal>
  );
}
