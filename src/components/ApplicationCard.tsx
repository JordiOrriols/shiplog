import React from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@jordiorriols/ui";
import { ClipboardCheck, Pencil, Trash2 } from "@jordiorriols/ui/icons";
import type { Application } from "@/lib/contracts";

export default function ApplicationCard({
  application,
  teamName,
  inUse,
  busy = false,
  onEdit,
  onDelete,
  onTemplate,
}: {
  application: Application;
  teamName: string | undefined;
  inUse: boolean;
  busy?: boolean;
  onEdit?: () => void;
  onDelete?: () => void;
  onTemplate?: () => void;
}) {
  const { t } = useTranslation();
  return (
    <article className="panel space-y-3">
      <div className="flex items-start justify-between gap-2">
        <h2 className="text-lg font-semibold">{application.name}</h2>
        <div className="flex items-center gap-1">
          {onEdit && (
            <Button
              size="icon-sm"
              variant="ghost"
              aria-label={t("applications.editNamed", {
                name: application.name,
              })}
              onClick={onEdit}
            >
              <Pencil className="size-4" aria-hidden="true" />
            </Button>
          )}
          {onDelete && (
            <Button
              size="icon-sm"
              variant="ghost"
              aria-label={t("applications.deleteNamed", {
                name: application.name,
              })}
              tooltip={t(
                inUse ? "applications.hasReleases" : "applications.deleteNamed",
                { name: application.name },
              )}
              disabled={busy || inUse}
              className="text-destructive hover:text-destructive"
              onClick={onDelete}
            >
              <Trash2 className="size-4" aria-hidden="true" />
            </Button>
          )}
          {onTemplate && (
            <Button
              size="icon-sm"
              variant="ghost"
              aria-label={t("readiness.templateTitle", {
                name: application.name,
              })}
              onClick={onTemplate}
            >
              <ClipboardCheck className="size-4" aria-hidden="true" />
            </Button>
          )}
        </div>
      </div>
      <p className="text-sm text-muted-foreground whitespace-pre-wrap">
        {application.description}
      </p>
      <span
        className="inline-flex rounded-md bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground"
        data-testid="application-team"
      >
        {teamName ?? t("applications.noTeam")}
      </span>
    </article>
  );
}
