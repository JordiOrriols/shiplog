import React, { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AppFooter,
  AppMain,
  AppPage,
  AppSkeleton,
  Button,
  ConfirmDialog,
  ErrorState,
  LanguageSelector,
} from "@jordiorriols/ui";
import { useAsyncAction } from "@jordiorriols/ui/hooks";
import { platformRepository } from "@/data/platform";
import ApplicationCard from "@/components/ApplicationCard";
import { ApplicationFormView } from "@/components/ApplicationForm";
import type { Application } from "@/lib/contracts";

export default function PlatformApplications() {
  const { workspace } = useParams();
  const { t, i18n } = useTranslation();
  const client = useQueryClient();
  const directory = useQuery({
    queryKey: ["platform-workspaces", "shiplog"],
    queryFn: platformRepository.workspaces,
    refetchInterval: 60_000,
  });
  const access = directory.data?.find((item) => item.id === workspace);
  const canEdit = access?.role === "owner" || access?.role === "editor";
  const internal = canEdit || access?.role === "viewer";
  const query = useQuery({
    queryKey: ["platform-shiplog-applications", workspace],
    enabled: !!workspace && internal,
    refetchInterval: 60_000,
    queryFn: () => {
      if (!workspace) throw new Error(t("portal.unavailable"));
      return platformRepository.applications(workspace);
    },
  });
  const [editing, setEditing] = useState<Application | null>(null);
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState<Application | null>(null);
  const action = useAsyncAction();
  const error = directory.error ?? query.error;
  return (
    <AppPage className="flex min-h-screen flex-col">
      <AppMain className="w-full flex-1 space-y-6">
        <header className="flex items-start justify-between gap-4">
          <h1 className="text-3xl font-semibold">
            {access?.name ?? t("app.name")}
          </h1>
          <LanguageSelector
            value={i18n.language}
            label={t("app.language")}
            onValueChange={(value) => void i18n.changeLanguage(value)}
          />
        </header>
        <nav className="flex gap-4">
          <Link to="/">{t("app.name")}</Link>
          {workspace && (
            <Link to={`/workspaces/${workspace}/releases`}>
              {t("sections.releases")}
            </Link>
          )}
        </nav>
        <h2 className="text-2xl font-semibold">{t("sections.applications")}</h2>
        {directory.isPending || (internal && query.isPending) ? (
          <AppSkeleton label={t("common.loading")} fullPage={false} />
        ) : error ? (
          <ErrorState
            message={error.message}
            retryLabel={t("common.retry")}
            onRetry={() => {
              void directory.refetch();
              void query.refetch();
            }}
          />
        ) : !internal || !workspace ? (
          <p role="alert">{t("portal.unavailable")}</p>
        ) : query.data ? (
          <>
            {canEdit ? (
              <Button onClick={() => setCreating(true)}>
                {t("applications.new")}
              </Button>
            ) : (
              <p>{t("common.readOnly")}</p>
            )}
            <div className="grid gap-4 md:grid-cols-2">
              {query.data.applications.map((application) => (
                <ApplicationCard
                  key={application.id}
                  application={application}
                  teamName={
                    query.data.teams.find(
                      (team) => team.id === application.team_id,
                    )?.name
                  }
                  inUse={application.in_use}
                  busy={action.busy}
                  {...(canEdit
                    ? {
                        onEdit: () => setEditing(application),
                        onDelete: () => {
                          action.reset();
                          setDeleting(application);
                        },
                      }
                    : {})}
                />
              ))}
            </div>
            {!query.data.applications.length && (
              <p role="status">{t("common.empty")}</p>
            )}
            {canEdit && (creating || editing) && (
              <ApplicationFormView
                {...(editing ? { application: editing } : {})}
                teams={{
                  data: query.data.teams,
                  isPending: false,
                  error: null,
                  refetch: query.refetch,
                }}
                onClose={() => {
                  setCreating(false);
                  setEditing(null);
                }}
                save={async (input, id) => {
                  const updated = await platformRepository.saveApplication(
                    workspace,
                    input,
                    id,
                  );
                  client.setQueryData(
                    ["platform-shiplog-applications", workspace],
                    updated,
                  );
                  await client.invalidateQueries(
                    { queryKey: ["shiplog-catalog", workspace] },
                    { throwOnError: true },
                  );
                }}
              />
            )}
            {canEdit && deleting && (
              <ConfirmDialog
                isOpen
                title={t("applications.deleteNamed", { name: deleting.name })}
                description={t("applications.deleteConfirm", {
                  name: deleting.name,
                })}
                confirmLabel={t("common.delete")}
                cancelLabel={t("common.close")}
                onCancel={() => setDeleting(null)}
                onConfirm={() => {
                  if (action.busy) return;
                  const id = deleting.id;
                  setDeleting(null);
                  void action.run(async () => {
                    const updated = await platformRepository.deleteApplication(
                      workspace,
                      id,
                    );
                    client.setQueryData(
                      ["platform-shiplog-applications", workspace],
                      updated,
                    );
                    await client.invalidateQueries(
                      { queryKey: ["shiplog-catalog", workspace] },
                      { throwOnError: true },
                    );
                  });
                }}
              />
            )}
            {action.error && <ErrorState message={action.error} />}
          </>
        ) : null}
      </AppMain>
      <AppFooter text={t("app.footer")} />
    </AppPage>
  );
}
