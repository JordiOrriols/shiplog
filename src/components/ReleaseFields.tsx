import React from "react";
import { useTranslation } from "react-i18next";
import { FormField, Input, SelectField, Textarea } from "@jordiorriols/ui";
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
    <FormField id={name} label={label} className="space-y-1">
      {(field) => (
        <Input
          {...field}
          name={name}
          required
          defaultValue={initial}
          {...props}
        />
      )}
    </FormField>
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
    <FormField id={name} label={label} className="space-y-1">
      {(field) => (
        <Textarea
          {...field}
          name={name}
          defaultValue={initial}
          maxLength={maxLength}
        />
      )}
    </FormField>
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
      </fieldset>
      <FormField
        id="release-status"
        label={t("simple.status")}
        className="space-y-1"
      >
        {(field) => (
          <SelectField
            {...field}
            name="status"
            defaultValue={initial?.status ?? "draft"}
            options={["draft", "qa", "released"].map((status) => ({
              value: status,
              label: t(`statuses.${status}`),
            }))}
          />
        )}
      </FormField>
      <fieldset disabled={!draftEditable} className="space-y-4">
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
