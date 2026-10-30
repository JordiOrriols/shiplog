import React from "react";
import { Route, Routes, Navigate } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ErrorBoundary, type FallbackProps } from "react-error-boundary";
import { useTranslation } from "react-i18next";
import { Button } from "@jordiorriols/ui";
import { DataProvider } from "./data/DataProvider";
import { WorkspaceProvider } from "./data/WorkspaceProvider";
import { EntryGate } from "./components/EntryGate";
import { PasswordResetDialog } from "./components/PasswordResetDialog";
import AppLayout from "./components/AppLayout";
import WorkspacePage from "./pages/WorkspacePage";
import PublicReleases from "./pages/PublicReleases";

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1 } },
});
function Fallback({ error, resetErrorBoundary }: FallbackProps) {
  const { t } = useTranslation();
  return (
    <main className="p-8 space-y-4">
      <h1>{t("app.errors.title")}</h1>
      <p role="alert">
        {error instanceof Error ? error.message : String(error)}
      </p>
      <Button onClick={resetErrorBoundary}>{t("app.actions.tryAgain")}</Button>
    </main>
  );
}
function Internal() {
  return (
    <DataProvider>
      <PasswordResetDialog />
      <EntryGate>
        <WorkspaceProvider>
          <Routes>
            <Route element={<AppLayout />}>
              <Route index element={<WorkspacePage section="overview" />} />
              <Route
                path="applications"
                element={<WorkspacePage section="applications" />}
              />
              <Route
                path="releases"
                element={<WorkspacePage section="releases" />}
              />
              <Route path="portal" element={<Navigate to="/" replace />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Route>
          </Routes>
        </WorkspaceProvider>
      </EntryGate>
    </DataProvider>
  );
}
export default function App() {
  return (
    <ErrorBoundary FallbackComponent={Fallback}>
      <QueryClientProvider client={queryClient}>
        <Routes>
          <Route path="/public/:token/releases" element={<PublicReleases />} />
          <Route
            path="/public/:token/releases/:releaseId"
            element={<PublicReleases />}
          />
          <Route path="*" element={<Internal />} />
        </Routes>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}
