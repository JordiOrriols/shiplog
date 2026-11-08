import React from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { platformRepository } from "@/data/platform";
import { ReleaseApprovalsView } from "./ReleaseApprovals";

export default function PlatformReleaseApprovals({
  workspace,
  releaseId,
  qa,
}: {
  workspace: string;
  releaseId: string;
  qa: React.ReactNode;
}) {
  const client = useQueryClient();
  const key = ["platform-shiplog-decisions", workspace, releaseId];
  const query = useQuery({
    queryKey: key,
    refetchInterval: 60_000,
    queryFn: () => platformRepository.decisions(workspace, releaseId),
  });
  return (
    <ReleaseApprovalsView
      accountId={query.data?.account_id}
      query={{ ...query, data: query.data?.decisions }}
      qa={qa}
      save={async (approved) => {
        const updated = await platformRepository.decideRelease(
          workspace,
          releaseId,
          approved,
        );
        client.setQueryData(key, updated);
      }}
    />
  );
}
