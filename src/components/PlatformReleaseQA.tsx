import React from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { platformRepository } from "@/data/platform";
import type { Release } from "@/lib/contracts";
import { ReleaseQAView } from "./ReleaseQA";
import { ReleaseReadinessView } from "./ReleaseReadiness";

export default function PlatformReleaseQA({
  workspace,
  release,
  canEdit,
}: {
  workspace: string;
  release: Release;
  canEdit: boolean;
}) {
  const client = useQueryClient();
  const key = ["platform-shiplog-readiness", workspace, release.id];
  const query = useQuery({
    queryKey: key,
    queryFn: () => platformRepository.readiness(workspace, release.id),
  });
  return (
    <ReleaseQAView release={release} query={query}>
      <ReleaseReadinessView
        query={query}
        canEdit={canEdit}
        complete={async (item, completed) => {
          const updated = await platformRepository.completeChecklistItem(
            workspace,
            release.id,
            item,
            completed,
          );
          client.setQueryData(key, updated);
        }}
      />
    </ReleaseQAView>
  );
}
