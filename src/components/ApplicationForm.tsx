import React from "react";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import {
  AppSkeleton,
  Button,
  Label,
  Modal,
  SelectField,
} from "@jordiorriols/ui";
import { useAsyncAction } from "@jordiorriols/ui/hooks";
import { useData } from "@/data/DataProvider";
import { useWorkspace } from "@/data/WorkspaceProvider";
import { useWorkspaceData } from "@/data/useWorkspaceData";
import type { Application } from "@/lib/contracts";
import { localizeError } from "@/lib/localizeError";
import { Field, TextField } from "./ReleaseFields";

export default function ApplicationForm({
  application,
  onClose,
}: {
  application?: Application;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const { repository, user } = useData();
  const { workspace } = useWorkspace();
  const data = useWorkspaceData();
  const action = useAsyncAction();
  const teams = useQuery({
    queryKey: ["shiplog-teams", user?.id, workspace?.id],
    queryFn: () => {
      if (!repository || !workspace) throw new Error(t("portal.unavailable"));
      return repository.teams(workspace.id);
    },
  });
  return (
    <Modal
      isOpen
      title={t(application ? "applications.edit" : "applications.new")}
      description={t("applications.description")}
      closeLabel={t("common.close")}
      footer={
        <Button
          type="submit"
          form="application-form"
          disabled={action.busy || !teams.data}
        >
          {t("common.save")}
        </Button>
      }
      onOpenChange={(open) => {
        if (!open && !action.busy) onClose();
      }}
    >
      <div className="space-y-4">
        {teams.isPending ? (
          <AppSkeleton fullPage={false} label={t("common.loading")} />
        ) : teams.error ? (
          <div role="alert">
            <p>{localizeError(teams.error.message)}</p>
            <Button onClick={() => void teams.refetch()}>
              {t("common.retry")}
            </Button>
          </div>
        ) : (
          <form
            id="application-form"
            className="space-y-4"
            onSubmit={(event) => {
              event.preventDefault();
              if (!repository || !workspace || action.busy) return;
              const form = new FormData(event.currentTarget);
              const input = {
                name: String(form.get("name") ?? ""),
                description: String(form.get("description") ?? ""),
                team_id: String(form.get("team") ?? "") || null,
              };
              void action.run(async () => {
                await repository.saveApplication(
                  workspace.id,
                  input,
                  application?.id,
                );
                await data.refresh();
                onClose();
              });
            }}
          >
            <fieldset disabled={action.busy} className="space-y-4">
              <Field
                name="name"
                label={t("common.name")}
                maxLength={120}
                initial={application?.name ?? ""}
              />
              <TextField
                name="description"
                label={t("common.description")}
                maxLength={4000}
                initial={application?.description ?? ""}
              />
              <Label htmlFor="team">{t("applications.team")}</Label>
              <SelectField
                id="team"
                name="team"
                defaultValue={application?.team_id ?? ""}
                options={[
                  { value: "", label: t("applications.noTeam") },
                  ...teams.data.map((team) => ({
                    value: team.id,
                    label: team.name,
                  })),
                ]}
              />
            </fieldset>
            {action.error && (
              <p role="alert" className="text-sm text-destructive">
                {localizeError(action.error)}
              </p>
            )}
          </form>
        )}
      </div>
    </Modal>
  );
}
