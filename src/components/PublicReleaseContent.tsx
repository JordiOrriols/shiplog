import React from "react";
import { useTranslation } from "react-i18next";
import type { PublicRelease } from "@/lib/contracts";

export default function PublicReleaseContent({
  release,
}: {
  release: PublicRelease;
}) {
  const { t } = useTranslation();
  return (
    <div className="space-y-5">
      <p className="whitespace-pre-wrap break-words text-sm leading-7">
        {release.public_notes}
      </p>
      {release.features.length > 0 && (
        <section aria-label={t("featureLinks.title")}>
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {t("featureLinks.title")}
          </h3>
          <ul className="mt-2 flex flex-wrap gap-2">
            {release.features.map((feature, index) => (
              <li
                key={index}
                className="rounded-md bg-muted px-2 py-1 text-sm break-words"
              >
                {feature.name}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
