import React from "react";
import { useTranslation } from "react-i18next";
import { Input, Label } from "@jordiorriols/ui";
import type { Release } from "@/lib/contracts";

export function Field({
  name,
  label,
  initial = "",
  ...props
}: {
  name: string;
  label: string;
  initial?: string;
  maxLength: number;
  pattern?: string;
}) {
  return (
    <div className="space-y-1">
      <Label htmlFor={name}>{label}</Label>
      <Input id={name} name={name} required defaultValue={initial} {...props} />
    </div>
  );
}
export function TextField({
  name,
  label,
  initial = "",
  maxLength,
}: {
  name: string;
  label: string;
  initial?: string;
  maxLength: number;
}) {
  return (
    <div className="space-y-1">
      <Label htmlFor={name}>{label}</Label>
      <textarea
        className="field min-h-24"
        id={name}
        name={name}
        defaultValue={initial}
        maxLength={maxLength}
      />
    </div>
  );
}
export function ReleaseFields({
  initial,
  draftEditable = true,
}: {
  initial?: Release;
  draftEditable?: boolean;
}) {
  const { t } = useTranslation();
  return (
    <>
      <fieldset disabled={!draftEditable} className="space-y-4">
        <Field
          name="version"
          label={t("common.version")}
          maxLength={100}
          initial={initial?.version ?? ""}
        />
        <p className="text-xs text-muted-foreground">
          {t("releases.versionHint")}
        </p>
        <p className="text-xs text-muted-foreground">
          {t("releases.autoType")}
        </p>
        <Field
          name="title"
          label={t("common.title")}
          maxLength={160}
          initial={initial?.title ?? ""}
        />
      </fieldset>
      {!draftEditable && initial && (
        <>
          <input type="hidden" name="version" value={initial.version} />
          <input type="hidden" name="title" value={initial.title} />
        </>
      )}
      <TextField
        name="public_notes"
        label={t("releases.public")}
        maxLength={20000}
        initial={initial?.public_notes ?? ""}
      />
    </>
  );
}
export function releaseFormInput(form: HTMLFormElement, application?: string) {
  const data = new FormData(form);
  const field = (name: string) => String(data.get(name) ?? "");
  return {
    application_id: application ?? field("application_id"),
    version: field("version"),
    title: field("title"),
    public_notes: field("public_notes"),
  };
}
