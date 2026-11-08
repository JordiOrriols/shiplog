import React, { useState } from "react";
import { localizeError } from "@/lib/localizeError";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import {
  PublicAppShell,
  AppSkeleton,
  Button,
  SelectField,
} from "@jordiorriols/ui";
import { platformRepository } from "@/data/platform";
import { z } from "zod";
import PublicReleaseContent from "@/components/PublicReleaseContent";
import PlatformReleaseDetails from "@/components/PlatformReleaseDetails";
import PlatformReleaseQA from "@/components/PlatformReleaseQA";
import PlatformReleaseApprovals from "@/components/PlatformReleaseApprovals";

export default function PublicReleases() {
  const { workspace = "", releaseId } = useParams();
  const [search, setSearch] = useSearchParams();
  const filter = search.get("application") ?? "";
  const { t, i18n } = useTranslation();
  const [creating, setCreating] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const directory = useQuery({
    queryKey: ["platform-workspaces", "shiplog"],
    queryFn: platformRepository.workspaces,
    refetchInterval: 60_000,
  });
  const internal = directory.data?.some(
    (item) => item.id === workspace && item.role !== "external",
  );
  const access = directory.data?.find((item) => item.id === workspace);
  const canEdit = access?.role === "owner" || access?.role === "editor";
  const query = useQuery({
    queryKey: ["shiplog-catalog", workspace],
    retry: false,
    refetchInterval: 60_000,
    queryFn: () => {
      if (!z.string().uuid().safeParse(workspace).success)
        throw new Error(t("portal.unavailable"));
      return platformRepository.catalog(workspace);
    },
  });
  const names = new Map(
    query.data?.applications.map((app) => [app.id, app.name]),
  );
  const editing = query.data?.releases.find((item) => item.id === editingId);
  const releases =
    query.data?.releases.filter(
      (release) =>
        (!filter || release.application_id === filter) &&
        (!releaseId || release.id === releaseId),
    ) ?? [];
  return (
    <PublicAppShell
      projectId="shiplog"
      mainClassName="space-y-8"
      footer={{ text: t("app.footer") }}
      header={{
        title: query.data?.name ?? t("portal.title"),
        subtitle: t("portal.title"),
        language: {
          value: i18n.language,
          label: t("app.language"),
          onValueChange: (language) => void i18n.changeLanguage(language),
        },
      }}
    >
      <nav className="flex gap-4">
        <Link to="/">{t("app.name")}</Link>
        {internal && (
          <>
            <Link to={`/workspaces/${workspace}/applications`}>
              {t("sections.applications")}
            </Link>
            <Link to={`/workspaces/${workspace}/audit`}>
              {t("audit.title")}
            </Link>
          </>
        )}
      </nav>
      {directory.error && (
        <div role="alert">
          <p>{localizeError(directory.error.message)}</p>
          <Button onClick={() => void directory.refetch()}>
            {t("common.retry")}
          </Button>
        </div>
      )}
      {query.isPending ? (
        <AppSkeleton label={t("common.loading")} fullPage={false} />
      ) : query.error ? (
        <div role="alert">
          <p>{localizeError(query.error.message)}</p>
          <Button onClick={() => void query.refetch()}>
            {t("common.retry")}
          </Button>
        </div>
      ) : (
        <>
          {canEdit && (
            <Button
              disabled={!query.data.applications.length}
              onClick={() => setCreating(true)}
            >
              {t("releases.new")}
            </Button>
          )}
          {releaseId ? (
            <Link to={`/workspaces/${workspace}/releases`}>
              {t("portal.title")}
            </Link>
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
                  <Link to={`/workspaces/${workspace}/releases/${release.id}`}>
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
                {internal && (
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      onClick={() => setEditingId(release.id)}
                    >
                      {t("releases.detail")}
                    </Button>
                    <PlatformReleaseApprovals
                      workspace={workspace}
                      releaseId={release.id}
                      qa={
                        <PlatformReleaseQA
                          workspace={workspace}
                          release={release}
                          canEdit={canEdit}
                        />
                      }
                    />
                  </div>
                )}
              </article>
            ))}
            {!releases.length && (
              <p role="status" className="text-muted-foreground">
                {t("portal.empty")}
              </p>
            )}
          </div>
          {internal && (creating || editing) && (
            <PlatformReleaseDetails
              key={editingId ?? "new"}
              workspace={workspace}
              {...(editing ? { release: editing } : {})}
              applications={query.data.applications}
              canEdit={canEdit}
              onClose={() => {
                setCreating(false);
                setEditingId(null);
              }}
            />
          )}
        </>
      )}
    </PublicAppShell>
  );
}
