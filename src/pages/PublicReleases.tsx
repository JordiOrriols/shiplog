import React from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import {
  AppFooter,
  AppMain,
  AppPage,
  AppSkeleton,
  Button,
  LanguageSelector,
} from "@jordiorriols/ui";
import { createShiplogRepository } from "@/data/repository";
import { supabase } from "@/data/supabaseClient";
import { z } from "zod";
import PublicReleaseContent from "@/components/PublicReleaseContent";

const repository = supabase ? createShiplogRepository(supabase) : null;
export default function PublicReleases() {
  const { token = "", releaseId } = useParams();
  const [search, setSearch] = useSearchParams();
  const filter = search.get("application") ?? "";
  const { t, i18n } = useTranslation();
  const query = useQuery({
    queryKey: ["shiplog-public", token],
    retry: false,
    refetchInterval: 60_000,
    queryFn: () => {
      if (!repository || !z.string().uuid().safeParse(token).success)
        throw new Error(t("portal.unavailable"));
      return repository.publicCatalog(token);
    },
  });
  const names = new Map(
    query.data?.applications.map((app) => [app.id, app.name]),
  );
  const releases =
    query.data?.releases.filter(
      (release) =>
        (!filter || release.application_id === filter) &&
        (!releaseId || release.id === releaseId),
    ) ?? [];
  return (
    <AppPage className="flex min-h-screen flex-col">
      <AppMain className="w-full flex-1 space-y-8">
        <header className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-brand">
              {t("app.name")}
            </p>
            <h1 className="mt-3 text-3xl font-semibold tracking-tight">
              {query.data?.name ?? t("portal.title")}
            </h1>
            <p className="mt-1 text-muted-foreground">{t("portal.title")}</p>
          </div>
          <LanguageSelector
            value={i18n.language}
            label={t("app.language")}
            onValueChange={(language) => void i18n.changeLanguage(language)}
          />
        </header>
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
          <>
            {releaseId ? (
              <Link to={`/public/${token}/releases`}>{t("portal.title")}</Link>
            ) : (
              <label className="flex flex-wrap items-center gap-3 text-sm">
                {t("portal.filter")}
                <select
                  aria-label={t("portal.filter")}
                  className="field max-w-xs"
                  value={filter}
                  onChange={(event) => {
                    const next = new URLSearchParams(search);
                    if (event.target.value)
                      next.set("application", event.target.value);
                    else next.delete("application");
                    setSearch(next);
                  }}
                >
                  <option value="">{t("common.allApps")}</option>
                  {query.data?.applications.map((app) => (
                    <option key={app.id} value={app.id}>
                      {app.name}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <div className="space-y-4">
              {releases.map((release) => (
                <article key={release.id} className="panel space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
                    <span className="font-medium">
                      {names.get(release.application_id)}
                    </span>
                    <time dateTime={release.published_at}>
                      {new Intl.DateTimeFormat(i18n.language, {
                        dateStyle: "long",
                      }).format(new Date(release.published_at))}
                    </time>
                  </div>
                  <h2 className="text-xl font-semibold">
                    <Link to={`/public/${token}/releases/${release.id}`}>
                      <span className="mr-3 font-mono text-brand">
                        {release.version}
                      </span>
                      {release.title}
                    </Link>
                  </h2>
                  <PublicReleaseContent release={release} />
                </article>
              ))}
              {!releases.length && (
                <p role="status" className="text-muted-foreground">
                  {t("portal.empty")}
                </p>
              )}
            </div>
          </>
        )}
      </AppMain>
      <AppFooter text={t("app.footer")} />
    </AppPage>
  );
}
