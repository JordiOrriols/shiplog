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
  SelectField,
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
                <SelectField
                  aria-label={t("portal.filter")}
                  className="max-w-xs"
                  value={filter}
                  onValueChange={(value) => {
                    const next = new URLSearchParams(search);
                    if (value) next.set("application", value);
                    else next.delete("application");
                    setSearch(next);
                  }}
                  options={[
                    { value: "", label: t("common.allApps") },
                    ...query.data.applications.map((app) => ({
                      value: app.id,
                      label: app.name,
                    })),
                  ]}
                />
              </label>
            )}
            <div className="space-y-4">
              {releases.map((release) => (
                <article key={release.id} className="panel space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
                    <span className="shrink-0 rounded-md bg-brand/10 px-2 py-0.5 text-[11px] font-medium tracking-normal text-brand">
                      {names.get(release.application_id)}
                    </span>
                    <time dateTime={release.created_at}>
                      {new Intl.DateTimeFormat(i18n.language, {
                        dateStyle: "long",
                      }).format(new Date(release.created_at))}
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
                  <p className="text-xs text-muted-foreground">
                    {t(`statuses.${release.status}`)}
                  </p>
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
      <AppFooter
        projectId="shiplog"
        language={i18n.language}
        text={t("app.footer")}
      />
    </AppPage>
  );
}
