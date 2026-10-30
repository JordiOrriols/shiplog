import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useData } from "./DataProvider";
import { useWorkspace } from "./WorkspaceProvider";

export function useWorkspaceData() {
  const { repository, user } = useData();
  const { workspace } = useWorkspace();
  const client = useQueryClient();
  const key = ["shiplog", user?.id, workspace?.id];
  const query = useQuery({
    queryKey: key,
    enabled: !!repository && !!workspace,
    queryFn: () => {
      if (!repository || !workspace)
        throw new Error("Shiplog workspace unavailable");
      return repository.loadWorkspace(workspace.id);
    },
  });
  return {
    ...query,
    refresh: () => client.invalidateQueries({ queryKey: key }),
  };
}
