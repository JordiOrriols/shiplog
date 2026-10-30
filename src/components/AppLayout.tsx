import React from "react";
import { NavLink, Outlet } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  AppHeader,
  AppMain,
  AppPage,
  AppNavigation,
  AppNavigationItem,
  AppFooter,
  AppSkeleton,
  Button,
  EmptyState,
  LanguageSelector,
  WorkspaceBar,
  getWorkspaceLabels,
} from "@jordiorriols/ui";
import {
  LayoutDashboard,
  Boxes,
  History,
  Megaphone,
  FolderOpen,
  Rocket,
} from "@jordiorriols/ui/icons";
import { useAsyncAction } from "@jordiorriols/ui/hooks";
import { useData } from "@/data/DataProvider";
import { useWorkspace } from "@/data/WorkspaceProvider";

const sections = [
  { path: "/", key: "overview", icon: LayoutDashboard },
  { path: "/applications", key: "applications", icon: Boxes },
  { path: "/releases", key: "releases", icon: History },
  { path: "/portal", key: "portal", icon: Megaphone },
];
export default function AppLayout() {
  const { t, i18n } = useTranslation();
  const { user, signOut, workspaceApi } = useData();
  const { workspaces, workspace, select, refresh, loading, error } =
    useWorkspace();
  const action = useAsyncAction();
  return (
    <AppPage className="flex min-h-screen flex-col">
      <AppHeader
        icon={<Rocket />}
        title={t("app.name")}
        subtitle={t("app.subtitle")}
        projectId="shiplog"
        projectSwitcherLabel={t("app.switchProject")}
        actions={
          <LanguageSelector
            value={i18n.language}
            label={t("app.language")}
            onValueChange={(language) => void i18n.changeLanguage(language)}
          />
        }
        accountAction={{
          type: "signOut",
          label: t("auth.signOut"),
          title: user?.email ?? "",
          disabled: action.busy,
          onClick: () => void action.run(signOut),
        }}
        navigation={
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
        }
      />
      <AppMain className="w-full flex-1">
        {action.error && (
          <p role="alert" className="text-destructive">
            {action.error}
          </p>
        )}
        {error ? (
          <div role="alert" className="space-y-3">
            <p>{error}</p>
            <Button onClick={() => void refresh()}>{t("common.retry")}</Button>
          </div>
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
      </AppMain>
      <AppFooter text={t("app.footer")} />
    </AppPage>
  );
}
