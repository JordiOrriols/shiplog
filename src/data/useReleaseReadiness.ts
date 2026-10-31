import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { useData } from "./DataProvider";

export function useReleaseReadiness(releaseId: string) {
  const { repository, user } = useData();
  const { t } = useTranslation();
  const key = ["shiplog-readiness", user?.id, releaseId];
  const query = useQuery({
    queryKey: key,
    queryFn: () => {
      if (!repository) throw new Error(t("portal.unavailable"));
      return repository.readiness(releaseId);
    },
  });
  return { query, key };
}
