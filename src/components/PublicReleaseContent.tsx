import React from "react";
import { useTranslation } from "react-i18next";
import { CHANGE_CATEGORIES, type PublicRelease } from "@/lib/contracts";

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
      {CHANGE_CATEGORIES.map((category) => {
        const changes = release.changes.filter(
          (change) => change.category === category,
        );
        return changes.length ? (
          <section
            key={category}
            aria-label={t(`changes.categories.${category}`)}
          >
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {t(`changes.categories.${category}`)}
            </h3>
            <ul className="mt-2 space-y-3">
              {changes.map((change, index) => (
                <li key={index} className="border-l-2 border-brand/30 pl-3">
                  <p className="text-sm font-medium break-words">
                    {change.title}
                  </p>
                  {change.description && (
                    <p className="mt-1 whitespace-pre-wrap break-words text-sm text-muted-foreground">
                      {change.description}
                    </p>
                  )}
                </li>
              ))}
            </ul>
          </section>
        ) : null;
      })}
    </div>
  );
}
