import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import { Button, Modal } from "@jordiorriols/ui";
import { ClipboardCheck } from "@jordiorriols/ui/icons";
import { useReleaseReadiness } from "@/data/useReleaseReadiness";
import { localizeError } from "@/lib/localizeError";
import type { Release } from "@/lib/contracts";
import ReleaseReadiness from "./ReleaseReadiness";

export default function ReleaseQA({
  release,
  canEdit,
}: {
  release: Release;
  canEdit: boolean;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const { query } = useReleaseReadiness(release.id);
  const items = query.data?.items ?? [];
  const complete =
    query.isSuccess &&
    items.length > 0 &&
    items.every((item) => !!item.completed_at);
  return (
    <>
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        aria-label={t("simple.qa")}
        data-qa-complete={complete}
        aria-busy={query.isFetching}
        className={
          complete
            ? "bg-green-600/10 text-green-700 hover:bg-green-600/20 hover:text-green-700 dark:text-green-400"
            : "text-muted-foreground"
        }
        onClick={() => setOpen(true)}
      >
        <ClipboardCheck className="size-4" aria-hidden="true" />
      </Button>
      {query.error && !open && (
        <span role="alert" className="text-xs text-destructive">
          {localizeError(query.error.message)}
        </span>
      )}
      {open && (
        <Modal
          isOpen
          title={t("simple.qa")}
          description={`${release.version} — ${release.title}`}
          closeLabel={t("common.close")}
          onOpenChange={setOpen}
        >
          <ReleaseReadiness release={release} canEdit={canEdit} />
        </Modal>
      )}
    </>
  );
}
