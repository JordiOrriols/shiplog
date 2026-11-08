import React from "react";
import { Link, useParams } from "react-router-dom";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import {
  AppFooter,
  AppMain,
  AppPage,
  AppSkeleton,
  Button,
  ErrorState,
  LanguageSelector,
} from "@jordiorriols/ui";
import { platformRepository } from "@/data/platform";
import { localizeError } from "@/lib/localizeError";

export default function PlatformAudit() {
  const { workspace = "" } = useParams();
  const { t, i18n } = useTranslation();
  const directory = useQuery({
    queryKey: ["platform-workspaces", "shiplog"],
    queryFn: platformRepository.workspaces,
    refetchInterval: 60_000,
  });
  const access = directory.data?.find((item) => item.id === workspace);
  const internal = !!access && access.role !== "external";
  const query = useInfiniteQuery({
    queryKey: ["platform-shiplog-audit", workspace],
    enabled: internal,
    initialPageParam: "",
    queryFn: ({ pageParam }) =>
      platformRepository.audit(workspace, pageParam || undefined),
    getNextPageParam: (last) => last.next_cursor ?? undefined,
  });
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
        <nav className="flex flex-wrap gap-4">
          <Link to="/">{t("app.name")}</Link>
          {internal && (
            <>
              <Link to={`/workspaces/${workspace}/releases`}>
                {t("sections.releases")}
              </Link>
              <Link to={`/workspaces/${workspace}/applications`}>
                {t("sections.applications")}
              </Link>
            </>
          )}
        </nav>
        <h2 className="text-2xl font-semibold">{t("audit.title")}</h2>
        {directory.isPending ? (
          <AppSkeleton fullPage={false} label={t("common.loading")} />
        ) : directory.error ? (
          <ErrorState
            message={localizeError(directory.error.message)}
            retryLabel={t("common.retry")}
            onRetry={() => void directory.refetch()}
          />
        ) : !internal ? (
          <p role="alert">{t("portal.unavailable")}</p>
        ) : (
          <>
            <p className="text-sm text-muted-foreground">
              {t("audit.description")}
            </p>
            {query.isPending && (
              <AppSkeleton fullPage={false} label={t("common.loading")} />
            )}
            {error && (
              <ErrorState
                message={localizeError(error.message)}
                retryLabel={t("common.retry")}
                onRetry={() => {
                  void (query.isFetchNextPageError
                    ? query.fetchNextPage()
                    : query.refetch());
                }}
              />
            )}
            <ol className="space-y-4">
              {query.data?.pages
                .flatMap((page) => page.events)
                .map((event) => (
                  <li
                    key={`${event.source}:${event.id}`}
                    className="panel space-y-2"
                  >
                    <h3 className="font-semibold break-words">{event.event}</h3>
                    <p className="text-sm text-muted-foreground">
                      {t(`audit.${event.source}`)}
                      {": "}
                      {event.source === "platform"
                        ? event.actor_name
                        : t("audit.legacyActor")}
                      {event.actor_id && (
                        <span className="ml-2 break-all font-mono text-xs">
                          {event.actor_id}
                        </span>
                      )}
                    </p>
                    <time dateTime={event.created_at} className="text-sm">
                      {new Intl.DateTimeFormat(i18n.language, {
                        dateStyle: "medium",
                        timeStyle: "medium",
                      }).format(new Date(event.created_at))}
                    </time>
                    <details>
                      <summary className="cursor-pointer">
                        {t("audit.details")}
                      </summary>
                      <pre className="mt-2 max-h-80 overflow-auto whitespace-pre-wrap break-words text-xs">
                        {JSON.stringify(event.details, null, 2)}
                      </pre>
                    </details>
                  </li>
                ))}
            </ol>
            {query.data && !query.data.pages[0]?.events.length && (
              <p role="status">{t("common.empty")}</p>
            )}
            {query.hasNextPage && (
              <Button
                disabled={query.isFetching}
                onClick={() => void query.fetchNextPage()}
              >
                {t("audit.more")}
              </Button>
            )}
          </>
        )}
      </AppMain>
      <AppFooter text={t("app.footer")} />
    </AppPage>
  );
}
