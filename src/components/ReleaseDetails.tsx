import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AppSkeleton,
  Button,
  Label,
  Modal,
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
  SelectField,
} from "@jordiorriols/ui";
import { useAsyncAction } from "@jordiorriols/ui/hooks";
import { useData } from "@/data/DataProvider";
import { useWorkspaceData } from "@/data/useWorkspaceData";
import { isEditableDraft, type Release } from "@/lib/contracts";
import { ReleaseFields, releaseFormInput } from "./ReleaseFields";
import ReleaseReadiness from "./ReleaseReadiness";

export default function ReleaseDetails({
  release,
  canEdit,
  onClose,
}: {
  release: Release;
  canEdit: boolean;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const { repository, user } = useData();
  const workspaceData = useWorkspaceData();
  const client = useQueryClient();
  const action = useAsyncAction();
  const [tab, setTab] = useState("details");
  const [selected, setSelected] = useState("");
  const editable = canEdit && isEditableDraft(release);
  const featuresKey = ["shiplog-features", user?.id, release.id];
  const features = useQuery({
    queryKey: featuresKey,
    enabled: tab === "changes",
    queryFn: () => {
      if (!repository) throw new Error(t("portal.unavailable"));
      return repository.releaseFeatures(release.id);
    },
  });
  const candidates = useQuery({
    queryKey: [...featuresKey, "candidates"],
    enabled: tab === "changes" && editable,
    queryFn: () => {
      if (!repository) throw new Error(t("portal.unavailable"));
      return repository.releaseFeatures(release.id, true);
    },
  });
  const linked = features.data ?? [];
  const available = candidates.data?.filter((feature) => !feature.linked) ?? [];
  const link = (id: string, enabled: boolean) => {
    if (!repository || action.busy) return;
    void action.run(async () => {
      await repository.linkFeature(release.id, id, enabled);
      setSelected("");
      await client.invalidateQueries({ queryKey: featuresKey });
    });
  };
  return (
    <Modal
      isOpen
      title={`${release.version} — ${release.title}`}
      description={t("releases.detail")}
      closeLabel={t("common.close")}
      onOpenChange={(open) => {
        if (!open && !action.busy) onClose();
      }}
      footer={
        canEdit &&
        (tab === "details" || (tab === "changes" && editable)) && (
          <Button
            type={tab === "details" ? "submit" : "button"}
            form={tab === "details" ? "release-details-form" : undefined}
            disabled={
              action.busy || (tab === "changes" && (!editable || !selected))
            }
            onClick={tab === "changes" ? () => link(selected, true) : undefined}
          >
            {t(tab === "details" ? "common.save" : "featureLinks.link")}
          </Button>
        )
      }
    >
      <Tabs value={tab} onValueChange={setTab} className="space-y-4">
        <TabsList aria-label={t("releases.detail")}>
          <TabsTrigger value="details" disabled={action.busy}>
            {t("featureLinks.details")}
          </TabsTrigger>
          <TabsTrigger value="changes" disabled={action.busy}>
            {t("featureLinks.changes")}
          </TabsTrigger>
          <TabsTrigger value="qa" disabled={action.busy}>
            {t("simple.qa")}
          </TabsTrigger>
        </TabsList>
        {action.error && (
          <p role="alert" className="text-sm text-destructive">
            {action.error}
          </p>
        )}
        <TabsContent value="details" forceMount hidden={tab !== "details"}>
          <form
            id="release-details-form"
            key={`${release.id}-${release.status}-${release.public_notes}`}
            className="space-y-4"
            onSubmit={(event) => {
              event.preventDefault();
              if (!repository || action.busy || !canEdit) return;
              const input = releaseFormInput(
                event.currentTarget,
                release.application_id,
              );
              const status = String(
                new FormData(event.currentTarget).get("status"),
              );
              void action.run(async () => {
                await repository.updateDetails(release.id, input, status);
                await workspaceData.refresh();
              });
            }}
          >
            <fieldset disabled={action.busy || !canEdit} className="space-y-4">
              <ReleaseFields initial={release} draftEditable={editable} />
              <div className="space-y-1">
                <Label htmlFor="release-status">{t("simple.status")}</Label>
                <SelectField
                  id="release-status"
                  name="status"
                  defaultValue={release.status}
                  options={["draft", "qa", "released"].map((status) => ({
                    value: status,
                    label: t(`statuses.${status}`),
                  }))}
                />
              </div>
            </fieldset>
            {!isEditableDraft(release) && (
              <p className="text-xs text-muted-foreground">
                {t("releases.historyLocked")}
              </p>
            )}
            <p className="text-xs text-muted-foreground">
              {t("releases.notesEditable")}
            </p>
          </form>
        </TabsContent>
        <TabsContent value="changes" className="space-y-4">
          <p className="text-sm text-muted-foreground">
            {t("featureLinks.description")}
          </p>
          {features.isPending ? (
            <AppSkeleton fullPage={false} label={t("common.loading")} />
          ) : features.error ? (
            <div role="alert">
              <p>{features.error.message}</p>
              <Button variant="outline" onClick={() => void features.refetch()}>
                {t("common.retry")}
              </Button>
            </div>
          ) : (
            <>
              {editable && candidates.error && (
                <div role="alert">
                  <p>{candidates.error.message}</p>
                  <Button
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
                  <SelectField
                    id="planner-feature"
                    value={selected}
                    disabled={action.busy || candidates.isPending}
                    onValueChange={setSelected}
                    options={[
                      { value: "", label: t("featureLinks.select") },
                      ...available.map((feature) => ({
                        value: feature.id,
                        label: feature.name,
                      })),
                    ]}
                  />
                </div>
              )}
              {linked.length ? (
                <ul className="divide-y divide-border">
                  {linked.map((feature) => (
                    <li
                      key={feature.id}
                      className="flex items-center justify-between gap-3 py-3"
                    >
                      <span className="break-words text-sm font-medium">
                        {feature.name}
                      </span>
                      {editable && candidates.isSuccess && (
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={action.busy}
                          aria-label={t("featureLinks.unlinkNamed", {
                            name: feature.name,
                          })}
                          onClick={() => link(feature.id, false)}
                        >
                          {t("featureLinks.unlink")}
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
        </TabsContent>
        <TabsContent value="qa">
          <ReleaseReadiness release={release} canEdit={canEdit} />
        </TabsContent>
      </Tabs>
    </Modal>
  );
}
