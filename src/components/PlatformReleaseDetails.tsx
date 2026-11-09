import React from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { platformRepository } from "@/data/platform";
import { ReleaseDetailsView } from "./ReleaseDetails";
import {
  isEditableDraft,
  type PublicCatalog,
  type Release,
} from "@/lib/contracts";

export default function PlatformReleaseDetails({
  workspace,
  release,
  applications,
  canEdit,
  onClose,
}: {
  workspace: string;
  release?: Release;
  applications: PublicCatalog["applications"];
  canEdit: boolean;
  onClose: () => void;
}) {
  const client = useQueryClient();
  const featuresKey = [
    "platform-shiplog-release-features",
    workspace,
    release?.id,
  ];
  const features = useQuery({
    queryKey: featuresKey,
    enabled: !!release,
    queryFn: () => {
      if (!release) throw new Error("Release is required");
      return platformRepository.releaseFeatures(workspace, release.id);
    },
  });
  const candidates = useQuery({
    queryKey: ["platform-shiplog-workspace-features", workspace],
    enabled: canEdit && (!release || isEditableDraft(release)),
    queryFn: () => platformRepository.workspaceFeatures(workspace),
  });
  return (
    <ReleaseDetailsView
      {...(release ? { release } : {})}
      canEdit={canEdit}
      onClose={onClose}
      applications={applications}
      features={features}
      candidates={candidates}
      save={async (input, status, ids, id) => {
        await platformRepository.saveConfiguration(
          workspace,
          input,
          status,
          ids,
          id,
        );
        await Promise.all([
          client.invalidateQueries(
            { queryKey: ["shiplog-catalog", workspace] },
            { throwOnError: true },
          ),
          client.invalidateQueries(
            { queryKey: featuresKey },
            { throwOnError: true },
          ),
          client.invalidateQueries(
            { queryKey: ["platform-shiplog-applications", workspace] },
            { throwOnError: true },
          ),
        ]);
      }}
    />
  );
}
