import React from "react";
import { Link, Route, Routes } from "react-router-dom";
import {
  QueryClient,
  QueryClientProvider,
  useQuery,
} from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import {
  AppFooter,
  AppMain,
  AppPage,
  AppSkeleton,
  Button,
  LanguageSelector,
} from "@jordiorriols/ui";
import { platformRepository } from "./data/platform";
import PublicReleases from "./pages/PublicReleases";
import PlatformApplications from "./pages/PlatformApplications";
import PlatformAudit from "./pages/PlatformAudit";

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: false } },
});

function WorkspaceDirectory() {
  const { t, i18n } = useTranslation();
  const query = useQuery({
    queryKey: ["platform-workspaces", "shiplog"],
    queryFn: platformRepository.workspaces,
    refetchInterval: 60_000,
  });
  return (
    <AppPage className="flex min-h-screen flex-col">
      <AppMain className="w-full flex-1 space-y-8">
        <header className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-3xl font-semibold">{t("app.name")}</h1>
            <p className="text-muted-foreground">{t("app.subtitle")}</p>
          </div>
          <LanguageSelector
            value={i18n.language}
            label={t("app.language")}
            onValueChange={(value) => void i18n.changeLanguage(value)}
          />
        </header>
        <a href="/ladders/workspace-access">{t("access.manageWorkspace")}</a>
        {query.isPending ? (
          <AppSkeleton label={t("common.loading")} fullPage={false} />
        ) : query.error ? (
          <div role="alert">
            <p>{query.error.message}</p>
            <Button onClick={() => void query.refetch()}>
              {t("common.retry")}
            </Button>
          </div>
        ) : (
          <ul className="space-y-3">
            {query.data.map((workspace) => (
              <li key={workspace.id} className="panel">
                <Link to={`/workspaces/${workspace.id}/releases`}>
                  {workspace.name}
                </Link>
                {workspace.role !== "external" && (
                  <>
                    <Link
                      className="ml-4 underline"
                      to={`/workspaces/${workspace.id}/applications`}
                    >
                      {t("sections.applications")}
                    </Link>
                    <Link
                      className="ml-4 underline"
                      to={`/workspaces/${workspace.id}/audit`}
                    >
                      {t("audit.title")}
                    </Link>
                  </>
                )}
              </li>
            ))}
            {!query.data.length && <li role="status">{t("access.empty")}</li>}
          </ul>
        )}
      </AppMain>
      <AppFooter text={t("app.footer")} />
    </AppPage>
  );
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <Routes>
        <Route index element={<WorkspaceDirectory />} />
        <Route path="workspaces/:workspace/audit" element={<PlatformAudit />} />
        <Route
          path="workspaces/:workspace/applications"
          element={<PlatformApplications />}
        />
        <Route
          path="workspaces/:workspace/releases"
          element={<PublicReleases />}
        />
        <Route
          path="workspaces/:workspace/releases/:releaseId"
          element={<PublicReleases />}
        />
        <Route path="*" element={<WorkspaceDirectory />} />
      </Routes>
    </QueryClientProvider>
  );
}
