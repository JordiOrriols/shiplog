import React from "react";
import { useTranslation } from "react-i18next";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AppSkeleton, Button } from "@jordiorriols/ui";
import { Check, X } from "@jordiorriols/ui/icons";
import { useAsyncAction } from "@jordiorriols/ui/hooks";
import { useData } from "@/data/DataProvider";

export default function ReleaseApprovals({ releaseId }: { releaseId: string }) {
  const { t } = useTranslation();
  const { repository, user } = useData();
  const client = useQueryClient();
  const action = useAsyncAction();
  const key = ["shiplog-decisions", user?.id, releaseId];
  const query = useQuery({
    queryKey: key,
    queryFn: () => {
      if (!repository) throw new Error(t("portal.unavailable"));
      return repository.decisions(releaseId);
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
  const own = query.data.find((member) => member.user_id === user?.id);
  return (
    <section
      aria-label={t("simple.approvals")}
      className="w-full min-w-0 space-y-3 sm:max-w-sm"
    >
      <select
        className="field"
        aria-label={t("simple.yourDecision")}
        value={
          own?.approved === true
            ? "approved"
            : own?.approved === false
              ? "disapproved"
              : ""
        }
        disabled={action.busy}
        onChange={(event) => {
          if (!repository || action.busy) return;
          const approved = event.target.value === "approved";
          void action.run(async () => {
            await repository.decideRelease(releaseId, approved);
            await client.invalidateQueries({ queryKey: key });
          });
        }}
      >
        <option value="" disabled>
          {t("simple.pending")}
        </option>
        <option value="approved">{t("simple.approve")}</option>
        <option value="disapproved">{t("simple.disapprove")}</option>
      </select>
      <ul className="flex flex-wrap gap-2">
        {query.data.map((member) => (
          <li
            key={member.user_id}
            className={`inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-xs ${member.approved === true ? "border-green-600/20 bg-green-600/10 text-green-700 dark:text-green-400" : member.approved === false ? "border-destructive/20 bg-destructive/10 text-destructive" : "border-border bg-muted text-muted-foreground"}`}
            title={`${member.name}: ${t(member.approved === true ? "simple.approved" : member.approved === false ? "simple.disapproved" : "simple.pending")}`}
          >
            <span className="break-all">{member.name}</span>
            <span className="flex shrink-0 items-center gap-1">
              {member.approved === true ? (
                <Check className="size-4" aria-hidden="true" />
              ) : member.approved === false ? (
                <X className="size-4" aria-hidden="true" />
              ) : null}
              {t(
                member.approved === true
                  ? "simple.approved"
                  : member.approved === false
                    ? "simple.disapproved"
                    : "simple.pending",
              )}
            </span>
          </li>
        ))}
      </ul>
      {action.error && (
        <p role="alert" className="text-sm text-destructive">
          {action.error}
        </p>
      )}
    </section>
  );
}
