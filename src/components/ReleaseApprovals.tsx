import React from "react";
import { useTranslation } from "react-i18next";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AppSkeleton, Button } from "@jordiorriols/ui";
import { ThumbsUp, ThumbsDown } from "@jordiorriols/ui/icons";
import { useAsyncAction } from "@jordiorriols/ui/hooks";
import { useData } from "@/data/DataProvider";
import { localizeError } from "@/lib/localizeError";

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
        <p>{localizeError(query.error.message)}</p>
        <Button onClick={() => void query.refetch()}>
          {t("common.retry")}
        </Button>
      </div>
    );
  const own = query.data.find((member) => member.user_id === user?.id);
  const decide = (approved: boolean) => {
    if (!repository || action.busy) return;
    void action.run(async () => {
      await repository.decideRelease(releaseId, approved);
      await client.invalidateQueries({ queryKey: key });
    });
  };
  return (
    <section
      aria-label={t("simple.approvals")}
      className="ml-auto flex w-full min-w-0 flex-col items-end gap-3 text-right sm:max-w-sm"
    >
      <div
        role="group"
        aria-label={t("simple.yourDecision")}
        className="flex items-center gap-1"
      >
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label={t("simple.approve")}
          aria-pressed={own?.approved === true}
          disabled={action.busy}
          onClick={() => decide(true)}
          className={
            own?.approved === true
              ? "bg-green-600/10 text-green-700 hover:bg-green-600/20 hover:text-green-700 dark:text-green-400"
              : "text-muted-foreground"
          }
        >
          <ThumbsUp className="size-4" aria-hidden="true" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label={t("simple.disapprove")}
          aria-pressed={own?.approved === false}
          disabled={action.busy}
          onClick={() => decide(false)}
          className={
            own?.approved === false
              ? "bg-destructive/10 text-destructive hover:bg-destructive/20 hover:text-destructive"
              : "text-muted-foreground"
          }
        >
          <ThumbsDown className="size-4" aria-hidden="true" />
        </Button>
      </div>
      <ul className="flex flex-wrap justify-end gap-2">
        {query.data
          .filter((member) => member.approved !== null)
          .map((member) => (
            <li
              key={member.user_id}
              className={`inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-xs ${member.approved ? "border-green-600/20 bg-green-600/10 text-green-700 dark:text-green-400" : "border-destructive/20 bg-destructive/10 text-destructive"}`}
              aria-label={`${member.name}: ${t(member.approved ? "simple.approved" : "simple.disapproved")}`}
            >
              {member.approved ? (
                <ThumbsUp className="size-4" aria-hidden="true" />
              ) : (
                <ThumbsDown className="size-4" aria-hidden="true" />
              )}
              <span className="break-all">{member.name}</span>
            </li>
          ))}
      </ul>
      {action.error && (
        <p role="alert" className="text-sm text-destructive">
          {localizeError(action.error)}
        </p>
      )}
    </section>
  );
}
