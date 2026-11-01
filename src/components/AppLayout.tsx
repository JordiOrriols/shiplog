import React, { useMemo } from "react";
import { NavLink, Outlet } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  AppShell,
  AppAccountControls,
  getDisplayName,
  AppNavigation,
  AppNavigationItem,
  AppSkeleton,
  EmptyState,
  ErrorState,
  WorkspaceBar,
  getWorkspaceLabels,
  type WorkspaceSharingConfig,
} from "@jordiorriols/ui";
import {
  LayoutDashboard,
  Boxes,
  History,
  FolderOpen,
} from "@jordiorriols/ui/icons";
import { useAuthDialogProps } from "./LoginDialog";
import { useData } from "@/data/DataProvider";
import { useWorkspace } from "@/data/WorkspaceProvider";
import { localizeError } from "@/lib/localizeError";

const sections = [
  { path: "/", key: "overview", icon: LayoutDashboard },
  { path: "/applications", key: "applications", icon: Boxes },
  { path: "/releases", key: "releases", icon: History },
];
export default function AppLayout() {
  const { t, i18n } = useTranslation();
  const { user, authEnabled, authError, workspaceApi, repository } = useData();
  const { workspaces, workspace, select, refresh, loading, error } =
    useWorkspace();
  const auth = useAuthDialogProps();
  const workspaceId = workspace?.id;
  const sharing = useMemo<WorkspaceSharingConfig | undefined>(
    () =>
      repository && workspaceId
        ? {
            readAccess: () => repository.sharingAccess(workspaceId),
            publicLink: {
              load: () => repository.portal(workspaceId),
              setEnabled: (enabled) => repository.portal(workspaceId, enabled),
              getUrl: (token) =>
                `${location.href.split("#")[0]}#/public/${token}/releases`,
              description: t("portal.description"),
            },
          }
        : undefined,
    [repository, workspaceId, user?.id, t],
  );
  return (
    <AppShell
      projectId="shiplog"
      footer={{ text: t("app.footer") }}
      header={{
        title: t("app.name"),
        subtitle: t("app.subtitle"),
        projectSwitcherLabel: t("app.switchProject"),
        language: {
          value: i18n.language,
          label: t("app.language"),
          className: "inline-flex",
          onValueChange: (language) => void i18n.changeLanguage(language),
        },
        actions: (
          <AppAccountControls
            {...auth}
            projectId="shiplog"
            enabled={authEnabled}
            signedIn={!!user}
            authError={authError}
            signOutLabel={t("auth.signOut")}
            accountTitle={getDisplayName({
              accountName:
                user?.user_metadata?.["full_name"] ??
                user?.user_metadata?.["name"],
              email: user?.email ?? "",
            })}
          />
        ),
        navigation: (
          <AppNavigation
            label={t("app.pages")}
            actions={
              workspaceApi && (
                <WorkspaceBar
                  api={workspaceApi}
                  app="shiplog"
                  workspaces={workspaces ?? []}
                  value={workspace?.id ?? ""}
                  onValueChange={select}
                  onCreated={async (created) => {
                    select(created.id);
                    await refresh();
                  }}
                  onSharesChanged={refresh}
                  labels={getWorkspaceLabels(i18n.language)}
                  {...(sharing ? { sharing } : {})}
                />
              )
            }
          >
            {sections.map(({ path, key, icon: Icon }) => (
              <AppNavigationItem key={path} asChild>
                <NavLink to={path} end={path === "/"}>
                  <Icon />
                  <span>{t(`sections.${key}`)}</span>
                </NavLink>
              </AppNavigationItem>
            ))}
          </AppNavigation>
        ),
      }}
    >
      {error ? (
        <ErrorState
          message={localizeError(error)}
          onRetry={() => void refresh()}
          retryLabel={t("common.retry")}
        />
      ) : loading ? (
        <AppSkeleton label={t("app.loading")} />
      ) : workspace ? (
        <Outlet key={workspace.id} />
      ) : (
        <EmptyState
          icon={<FolderOpen />}
          title={t("workspace.empty.title")}
          description={t("workspace.empty.description")}
        />
      )}
    </AppShell>
  );
}
