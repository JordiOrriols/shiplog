import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AppSkeleton, Button, ConfirmDialog, Input } from "@jordiorriols/ui";
import { useAsyncAction } from "@jordiorriols/ui/hooks";
import { useWorkspace } from "@/data/WorkspaceProvider";
import { useData } from "@/data/DataProvider";

export default function PortalPage() {
  const { t } = useTranslation();
  const { workspace } = useWorkspace();
  const { repository, user } = useData();
  const action = useAsyncAction();
  const [copied, setCopied] = useState(false);
  const [revoking, setRevoking] = useState(false);
  const client = useQueryClient();
  const canEdit =
    workspace?.access_level === "owner" || workspace?.access_level === "editor";
  const key = ["shiplog-portal", user?.id, workspace?.id];
  const query = useQuery({
    queryKey: key,
    enabled: !!repository && !!workspace && canEdit,
    queryFn: () => {
      if (!repository || !workspace) throw new Error(t("portal.unavailable"));
      return repository.portal(workspace.id);
    },
  });
  const url = query.data
    ? `${location.href.split("#")[0]}#/public/${query.data}/releases`
    : "";
  const change = (enabled: boolean) => {
    if (!repository || !workspace || action.busy) return;
    void action.run(async () => {
      const token = await repository.portal(workspace.id, enabled);
      client.setQueryData(key, token);
      setCopied(false);
      setRevoking(false);
    });
  };
  return (
    <section className="space-y-5 max-w-2xl">
      <header>
        <h1 className="text-2xl font-semibold">{t("sections.portal")}</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {t("portal.description")}
        </p>
      </header>
      {!canEdit ? (
        <p>{t("common.readOnly")}</p>
      ) : query.isPending ? (
        <AppSkeleton label={t("common.loading")} fullPage={false} />
      ) : query.error ? (
        <div role="alert">
          <p>{query.error.message}</p>
          <Button onClick={() => void query.refetch()}>
            {t("common.retry")}
          </Button>
        </div>
      ) : (
        <div className="panel space-y-4">
          {url ? (
            <>
              <Input
                aria-label={t("portal.link")}
                readOnly
                value={url}
                onFocus={(event) => event.target.select()}
              />
              <div className="flex flex-wrap gap-2">
                <Button
                  disabled={action.busy}
                  onClick={() =>
                    void action.run(async () => {
                      await navigator.clipboard.writeText(url);
                      setCopied(true);
                    })
                  }
                >
                  {t(copied ? "portal.copied" : "portal.copy")}
                </Button>
                <Button variant="outline" asChild>
                  <a href={url} target="_blank" rel="noreferrer">
                    {t("portal.open")}
                  </a>
                </Button>
                <Button
                  variant="destructive"
                  disabled={action.busy}
                  onClick={() => setRevoking(true)}
                >
                  {t("portal.revoke")}
                </Button>
              </div>
            </>
          ) : (
            <>
              <p className="text-sm">{t("portal.disabled")}</p>
              <Button disabled={action.busy} onClick={() => change(true)}>
                {t("portal.create")}
              </Button>
            </>
          )}
        </div>
      )}
      {action.error && (
        <p role="alert" className="text-destructive">
          {action.error}
        </p>
      )}
      <ConfirmDialog
        isOpen={revoking}
        title={t("portal.revoke")}
        description={t("portal.revokeDescription")}
        confirmLabel={t("portal.revoke")}
        cancelLabel={t("common.close")}
        onCancel={() => {
          if (!action.busy) setRevoking(false);
        }}
        onConfirm={() => change(false)}
      />
    </section>
  );
}
