import React from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { platformRepository } from "@/data/platform";
import type { Application } from "@/lib/contracts";
import { ChecklistTemplateView } from "./ChecklistTemplate";

export default function PlatformChecklistTemplate({
  workspace,
  application,
  onClose,
}: {
  workspace: string;
  application: Application;
  onClose: () => void;
}) {
  const client = useQueryClient();
  const key = ["platform-shiplog-template", workspace, application.id];
  const query = useQuery({
    queryKey: key,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    queryFn: () =>
      platformRepository.checklistTemplate(workspace, application.id),
  });
  return (
    <ChecklistTemplateView
      application={application}
      onClose={onClose}
      query={query}
      save={async (input) => {
        const updated = await platformRepository.saveChecklistTemplate(
          workspace,
          application.id,
          input,
        );
        client.setQueryData(key, updated);
      }}
    />
  );
}
