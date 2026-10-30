import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AppSkeleton, Button, Label } from "@jordiorriols/ui";
import { useAsyncAction } from "@jordiorriols/ui/hooks";
import { useData } from "@/data/DataProvider";
import { useWorkspaceData } from "@/data/useWorkspaceData";
import {
  DEPLOYMENT_OUTCOMES,
  type DeploymentInput,
  type Release,
} from "@/lib/contracts";
import { Field, TextField } from "./ReleaseFields";

function localNow() {
  const date = new Date();
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 16);
}

export default function ApplicationDeployments({
  applicationId,
  canEdit,
  initialReleaseId,
}: {
  applicationId: string;
  canEdit: boolean;
  initialReleaseId?: string;
}) {
  const { t, i18n } = useTranslation();
  const { repository, user } = useData();
  const workspaceData = useWorkspaceData();
  const client = useQueryClient();
  const [recording, setRecording] = useState(false);
  const action = useAsyncAction();
  const key = ["shiplog-deployments", user?.id, applicationId];
  const query = useQuery({
    queryKey: key,
    queryFn: () => {
      if (!repository) throw new Error(t("portal.unavailable"));
      return repository.deployments(applicationId);
    },
  });
  if (query.isPending)
    return <AppSkeleton fullPage={false} label={t("common.loading")} />;
  if (query.error)
    return (
      <div role="alert">
        <p>{query.error.message}</p>
        <Button onClick={() => void query.refetch()}>
          {t("common.retry")}
        </Button>
      </div>
    );
  const { environments, deployments, versions } = query.data;
  const releases =
    workspaceData.data?.releases.filter(
      (release) => release.application_id === applicationId,
    ) ?? [];
  const names = new Map(
    releases.map((release) => [release.id, release.version]),
  );
  const envNames = new Map(environments.map((env) => [env.id, env.name]));
  const date = (value: string) =>
    new Intl.DateTimeFormat(i18n.language, {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(value));
  return (
    <div className="space-y-5">
      <p className="text-sm text-muted-foreground">{t("deployments.notice")}</p>
      <section className="space-y-3">
        <h3 className="font-semibold">{t("deployments.current")}</h3>
        <div className="grid gap-3 sm:grid-cols-2">
          {environments.map((env) => {
            const current = versions.find(
              (version) => version.environment_id === env.id,
            );
            return (
              <section
                key={env.id}
                aria-label={t("deployments.environmentVersion", {
                  environment: env.name,
                })}
                className="rounded-lg border border-border p-3 space-y-1"
              >
                <p className="text-xs font-medium text-muted-foreground">
                  {env.name}
                </p>
                <p className="font-mono text-lg font-semibold">
                  {current
                    ? names.get(current.release_id)
                    : t("deployments.unknown")}
                </p>
                {current && (
                  <p className="text-xs text-muted-foreground">
                    {date(current.completed_at)}
                  </p>
                )}
              </section>
            );
          })}
        </div>
      </section>
      {canEdit && !recording && (
        <Button
          disabled={!releases.length || action.busy}
          onClick={() => setRecording(true)}
        >
          {t("deployments.record")}
        </Button>
      )}
      {recording && (
        <DeploymentForm
          releases={releases}
          environments={environments}
          initialReleaseId={initialReleaseId ?? releases[0]?.id ?? ""}
          busy={action.busy}
          onCancel={() => setRecording(false)}
          onSave={(input) => {
            void action.run(async () => {
              if (!repository) throw new Error(t("portal.unavailable"));
              await repository.recordDeployment(input);
              await Promise.all([
                client.invalidateQueries({ queryKey: key }),
                client.invalidateQueries({
                  queryKey: ["shiplog-readiness", user?.id],
                }),
                workspaceData.refresh(),
              ]);
              setRecording(false);
            });
          }}
        />
      )}
      {action.error && (
        <p role="alert" className="text-sm text-destructive">
          {action.error}
        </p>
      )}
      <section className="space-y-3">
        <h3 className="font-semibold">{t("deployments.history")}</h3>
        {!deployments.length && (
          <p className="text-sm text-muted-foreground">
            {t("deployments.empty")}
          </p>
        )}
        <ol className="space-y-4" aria-label={t("deployments.history")}>
          {deployments.map((deployment) => (
            <li
              key={deployment.id}
              className="border-l-2 border-brand/30 pl-3 space-y-2"
            >
              <p className="text-xs text-muted-foreground">
                {envNames.get(deployment.environment_id)} ·{" "}
                {date(deployment.completed_at)}
              </p>
              <p className="text-sm font-semibold">
                {t(`deployments.outcomes.${deployment.outcome}`)} ·{" "}
                <span className="font-mono">
                  {names.get(deployment.release_id)}
                </span>
                {deployment.rollback_target_id && (
                  <>
                    {" "}
                    →{" "}
                    <span className="font-mono">
                      {names.get(deployment.rollback_target_id)}
                    </span>
                  </>
                )}
              </p>
              <p className="text-xs text-muted-foreground">
                {t("deployments.started", {
                  date: date(deployment.started_at),
                })}
              </p>
              <p className="text-xs text-muted-foreground">
                {t("deployments.recordedBy", {
                  actor:
                    deployment.recorded_by ?? t("readiness.deletedAccount"),
                  date: date(deployment.created_at),
                })}
              </p>
              <p className="text-sm break-words">
                {deployment.source}
                {deployment.build_reference && (
                  <>
                    {" "}
                    ·{" "}
                    <span className="font-mono">
                      {deployment.build_reference}
                    </span>
                  </>
                )}
              </p>
              {deployment.pipeline_url && (
                <a
                  className="text-sm underline break-all"
                  href={deployment.pipeline_url}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {t("deployments.pipeline")}
                </a>
              )}
              {deployment.notes && (
                <p className="text-sm whitespace-pre-wrap break-words">
                  {deployment.notes}
                </p>
              )}
              {deployment.error_details && (
                <p className="text-sm text-destructive whitespace-pre-wrap break-words">
                  {deployment.error_details}
                </p>
              )}
              {!!deployment.readiness_warnings.length && (
                <ul className="text-xs text-muted-foreground">
                  {deployment.readiness_warnings.map((warning) => (
                    <li key={warning}>
                      {t(`deployments.warnings.${warning}`)}
                    </li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}

function DeploymentForm({
  releases,
  environments,
  initialReleaseId,
  busy,
  onCancel,
  onSave,
}: {
  releases: Release[];
  environments: { id: string; name: string; kind: string }[];
  initialReleaseId: string;
  busy: boolean;
  onCancel: () => void;
  onSave: (input: unknown) => void;
}) {
  const { t } = useTranslation();
  const { repository, user } = useData();
  const [releaseId, setReleaseId] = useState(initialReleaseId);
  const [environment, setEnvironment] = useState(environments[0]?.id ?? "");
  const [outcome, setOutcome] =
    useState<DeploymentInput["outcome"]>("succeeded");
  const [rollbackTarget, setRollbackTarget] = useState("");
  const [now] = useState(localNow);
  const [formError, setFormError] = useState<string | null>(null);
  const effective = outcome === "rollback" ? rollbackTarget : releaseId;
  const production =
    environments.find((env) => env.id === environment)?.kind === "production";
  const readiness = useQuery({
    queryKey: ["shiplog-readiness", user?.id, effective],
    enabled: production && !!effective,
    queryFn: () => {
      if (!repository) throw new Error(t("portal.unavailable"));
      return repository.readiness(effective);
    },
  });
  const selected = releases.find((release) => release.id === effective);
  const warnings = [
    ...(selected && selected.status !== "approved"
      ? ["release_not_approved"]
      : []),
    ...(readiness.data && readiness.data.qa_status !== "passed"
      ? ["manual_qa_not_passed"]
      : []),
    ...(readiness.data?.items.some(
      (item) => item.mandatory && !item.completed_at,
    )
      ? ["mandatory_items_incomplete"]
      : []),
  ];
  return (
    <form
      className="rounded-lg border border-border p-3 space-y-4"
      onSubmit={(event) => {
        event.preventDefault();
        if (busy) return;
        const form = new FormData(event.currentTarget);
        const field = (name: string) => String(form.get(name) ?? "");
        const started = new Date(field("started_at"));
        const completed = new Date(field("completed_at"));
        if (
          !Number.isFinite(started.getTime()) ||
          !Number.isFinite(completed.getTime())
        ) {
          setFormError(t("deployments.invalidDates"));
          return;
        }
        setFormError(null);
        onSave({
          environment_id: environment,
          release_id: releaseId,
          outcome,
          rollback_target_id: outcome === "rollback" ? rollbackTarget : null,
          started_at: started.toISOString(),
          completed_at: completed.toISOString(),
          source: field("source"),
          build_reference: field("build_reference"),
          pipeline_url: field("pipeline_url"),
          notes: field("deployment_notes"),
          error_details: field("error_details"),
        });
      }}
    >
      <p className="text-sm font-semibold">{t("deployments.record")}</p>
      <p className="text-xs text-muted-foreground">
        {t("deployments.immutable")}
      </p>
      <fieldset disabled={busy} className="space-y-3">
        <Label htmlFor="deployment_environment">
          {t("deployments.environment")}
        </Label>
        <select
          className="field"
          id="deployment_environment"
          value={environment}
          onChange={(event) => setEnvironment(event.target.value)}
          required
        >
          {environments.map((env) => (
            <option key={env.id} value={env.id}>
              {env.name}
            </option>
          ))}
        </select>
        <Label htmlFor="deployment_release">{t("deployments.release")}</Label>
        <select
          className="field"
          id="deployment_release"
          value={releaseId}
          onChange={(event) => setReleaseId(event.target.value)}
          required
        >
          {releases.map((release) => (
            <option key={release.id} value={release.id}>
              {release.version} — {release.title}
            </option>
          ))}
        </select>
        <Label htmlFor="deployment_outcome">{t("deployments.outcome")}</Label>
        <select
          className="field"
          id="deployment_outcome"
          value={outcome}
          onChange={(event) => {
            const parsed = DEPLOYMENT_OUTCOMES.find(
              (value) => value === event.target.value,
            );
            if (parsed) setOutcome(parsed);
          }}
        >
          {DEPLOYMENT_OUTCOMES.map((value) => (
            <option key={value} value={value}>
              {t(`deployments.outcomes.${value}`)}
            </option>
          ))}
        </select>
        {outcome === "rollback" && (
          <>
            <Label htmlFor="rollback_target">
              {t("deployments.rollbackTarget")}
            </Label>
            <select
              className="field"
              id="rollback_target"
              value={rollbackTarget}
              onChange={(event) => setRollbackTarget(event.target.value)}
              required
            >
              <option value="">{t("deployments.chooseTarget")}</option>
              {releases
                .filter((release) => release.id !== releaseId)
                .map((release) => (
                  <option key={release.id} value={release.id}>
                    {release.version} — {release.title}
                  </option>
                ))}
            </select>
            <p className="text-xs text-muted-foreground">
              {t("deployments.rollbackNotice")}
            </p>
          </>
        )}
        {production && (
          <div
            role="status"
            className="rounded-md border border-border p-3 space-y-2 text-sm"
          >
            <p>{t("deployments.warningNotice")}</p>
            {readiness.isFetching && <p>{t("common.loading")}</p>}
            {readiness.error && (
              <div role="alert">
                <p>{readiness.error.message}</p>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => void readiness.refetch()}
                >
                  {t("common.retry")}
                </Button>
              </div>
            )}
            <ul>
              {warnings.map((warning) => (
                <li key={warning}>{t(`deployments.warnings.${warning}`)}</li>
              ))}
            </ul>
          </div>
        )}
        <p className="text-xs text-muted-foreground">
          {t("deployments.timezone", {
            timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
          })}
        </p>
        <Label htmlFor="started_at">{t("deployments.start")}</Label>
        <input
          className="field"
          type="datetime-local"
          id="started_at"
          name="started_at"
          defaultValue={now}
          required
        />
        <Label htmlFor="completed_at">{t("deployments.completed")}</Label>
        <input
          className="field"
          type="datetime-local"
          id="completed_at"
          name="completed_at"
          defaultValue={now}
          required
        />
        <Field
          name="source"
          label={t("deployments.source")}
          maxLength={120}
          initial="Manual"
        />
        <TextField
          name="build_reference"
          label={t("deployments.build")}
          maxLength={300}
        />
        <TextField
          name="pipeline_url"
          label={t("deployments.pipelineUrl")}
          maxLength={2000}
        />
        <TextField
          name="deployment_notes"
          label={t(
            outcome === "rollback"
              ? "deployments.rollbackReason"
              : "deployments.notes",
          )}
          maxLength={10000}
        />
        <TextField
          name="error_details"
          label={t("deployments.errors")}
          maxLength={10000}
        />
      </fieldset>
      {formError && (
        <p role="alert" className="text-sm text-destructive">
          {formError}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={busy}>
          {t("deployments.save")}
        </Button>
        <Button
          type="button"
          variant="ghost"
          disabled={busy}
          onClick={onCancel}
        >
          {t("common.cancel")}
        </Button>
      </div>
    </form>
  );
}
