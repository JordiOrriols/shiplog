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
  const decide = (approved: boolean) => {
    if (!repository || action.busy) return;
    void action.run(async () => {
      await repository.decideRelease(releaseId, approved);
      await client.invalidateQueries({ queryKey: key });
    });
  };
  return (
    <section className="space-y-4">
      <h3 className="font-semibold">{t("simple.approvals")}</h3>
      <ul className="divide-y divide-border">
        {query.data.map((member) => (
          <li
            key={member.user_id}
            className="flex items-center justify-between gap-3 py-3 text-sm"
          >
            <span className="break-all">{member.name}</span>
            <span
              className={`flex shrink-0 items-center gap-1 text-xs ${member.approved === true ? "text-green-600" : member.approved === false ? "text-destructive" : "text-muted-foreground"}`}
            >
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
      <div className="flex flex-wrap gap-2">
        <Button
          disabled={action.busy || own?.approved === true}
          onClick={() => decide(true)}
        >
          <Check className="size-4" />
          {t("simple.approve")}
        </Button>
        <Button
          variant="outline"
          disabled={action.busy || own?.approved === false}
          onClick={() => decide(false)}
        >
          <X className="size-4" />
          {t("simple.disapprove")}
        </Button>
      </div>
      {action.error && (
        <p role="alert" className="text-sm text-destructive">
          {action.error}
        </p>
      )}
    </section>
  );
}
