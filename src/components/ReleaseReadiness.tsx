import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AppSkeleton, Button } from "@jordiorriols/ui";
import { useAsyncAction } from "@jordiorriols/ui/hooks";
import { useData } from "@/data/DataProvider";
import type { Release } from "@/lib/contracts";

export default function ReleaseReadiness({
  release,
  canEdit,
}: {
  release: Release;
  canEdit: boolean;
}) {
  const { t } = useTranslation();
  const { repository, user } = useData();
  const client = useQueryClient();
  const action = useAsyncAction();
  const [pending, setPending] = useState<{
    id: string;
    checked: boolean;
  } | null>(null);
  const key = ["shiplog-readiness", user?.id, release.id];
  const query = useQuery({
    queryKey: key,
    queryFn: () => {
      if (!repository) throw new Error(t("portal.unavailable"));
      return repository.readiness(release.id);
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
  const items = query.data.items;
  return (
    <section className="space-y-4">
      <h3 className="font-semibold">{t("simple.qa")}</h3>
      <p className="text-sm text-muted-foreground">
        {t("simple.checkProgress", {
          completed: items.filter((item) => item.completed_at).length,
          total: items.length,
        })}
      </p>
      {!items.length && (
        <p className="text-sm text-muted-foreground">{t("simple.noChecks")}</p>
      )}
      <ul className="divide-y divide-border">
        {items.map((item) => (
          <li key={item.id} className="py-3 space-y-1">
            <label className="flex items-start gap-3 text-sm font-medium">
              <input
                type="checkbox"
                className="mt-1 accent-green-600"
                disabled={!canEdit || action.busy}
                checked={
                  pending?.id === item.id
                    ? pending.checked
                    : !!item.completed_at
                }
                onChange={(event) => {
                  if (!repository || action.busy) return;
                  setPending({ id: item.id, checked: event.target.checked });
                  const checked = event.target.checked;
                  void action.run(async () => {
                    try {
                      await repository.completeChecklistItem(
                        release.id,
                        item.id,
                        checked,
                      );
                      await client.invalidateQueries({ queryKey: key });
                    } finally {
                      setPending(null);
                    }
                  });
                }}
              />
              <span className="break-words">{item.title}</span>
            </label>
            {item.description && (
              <p className="pl-6 text-sm text-muted-foreground whitespace-pre-wrap break-words">
                {item.description}
              </p>
            )}
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
