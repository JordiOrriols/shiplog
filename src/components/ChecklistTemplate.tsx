import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AppSkeleton, Button, Modal } from "@jordiorriols/ui";
import { useAsyncAction } from "@jordiorriols/ui/hooks";
import { useData } from "@/data/DataProvider";
import type {
  Application,
  ChecklistDefinition,
  ChecklistTemplate as Template,
} from "@/lib/contracts";
import { Field, TextField } from "./ReleaseFields";

export default function ChecklistTemplate({
  application,
  onClose,
}: {
  application: Application;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const { repository, user } = useData();
  const client = useQueryClient();
  const [saved, setSaved] = useState(false);
  const [reload, setReload] = useState(0);
  const key = ["shiplog-template", user?.id, application.id];
  const query = useQuery({
    queryKey: key,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    queryFn: () => {
      if (!repository) throw new Error(t("portal.unavailable"));
      return repository.checklistTemplate(application.id);
    },
  });
  return (
    <Modal
      isOpen
      title={t("readiness.templateTitle", { name: application.name })}
      description={t("readiness.templateNotice")}
      closeLabel={t("common.close")}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <div className="max-h-[calc(100dvh-16rem)] overflow-y-auto space-y-4">
        {saved && <p role="status">{t("readiness.templateSaved")}</p>}
        {query.isPending ? (
          <AppSkeleton fullPage={false} label={t("common.loading")} />
        ) : query.error ? (
          <div role="alert">
            <p>{query.error.message}</p>
            <Button onClick={() => void query.refetch()}>
              {t("common.retry")}
            </Button>
          </div>
        ) : (
          <TemplateEditor
            key={`${query.data.revision}-${reload}`}
            initial={query.data}
            onSave={async (items) => {
              setSaved(false);
              if (!repository) throw new Error(t("portal.unavailable"));
              await repository.saveChecklistTemplate(application.id, {
                revision: query.data.revision,
                items,
              });
              await client.invalidateQueries({ queryKey: key });
              setSaved(true);
            }}
            onReload={() => {
              setSaved(false);
              void query.refetch().then((result) => {
                if (!result.error) setReload((value) => value + 1);
              });
            }}
            onDirty={() => setSaved(false)}
          />
        )}
      </div>
    </Modal>
  );
}

function TemplateEditor({
  initial,
  onSave,
  onReload,
  onDirty,
}: {
  initial: Template;
  onSave: (items: ChecklistDefinition[]) => Promise<void>;
  onReload: () => void;
  onDirty: () => void;
}) {
  const { t } = useTranslation();
  const action = useAsyncAction();
  const [items, setItems] = useState(initial.items);
  const [editing, setEditing] = useState<number | "new" | null>(null);
  const item = typeof editing === "number" ? items[editing] : undefined;
  return (
    <div className="space-y-4">
      <p className="text-xs text-muted-foreground">
        {t("readiness.revision", { revision: initial.revision })}
      </p>
      {!items.length && <p>{t("readiness.noTemplate")}</p>}
      <ol className="space-y-3">
        {items.map((entry, index) => (
          <li
            key={index}
            className="rounded-lg border border-border p-3 space-y-2"
          >
            <p className="text-xs text-muted-foreground">
              {entry.category} ·{" "}
              {t(
                entry.mandatory ? "readiness.mandatory" : "readiness.optional",
              )}
            </p>
            <p className="font-medium break-words">{entry.title}</p>
            <p className="text-sm whitespace-pre-wrap break-words">
              {entry.description}
            </p>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="ghost"
                disabled={action.busy}
                aria-label={t("readiness.editItem", { title: entry.title })}
                onClick={() => {
                  onDirty();
                  setEditing(index);
                }}
              >
                {t("changes.edit")}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                disabled={action.busy}
                aria-label={t("readiness.removeItem", { title: entry.title })}
                onClick={() => {
                  onDirty();
                  setItems(items.filter((_, n) => n !== index));
                  setEditing(null);
                }}
              >
                {t("common.delete")}
              </Button>
            </div>
          </li>
        ))}
      </ol>
      {editing !== null ? (
        <form
          key={editing}
          className="space-y-3 rounded-lg border border-border p-3"
          onSubmit={(event) => {
            event.preventDefault();
            const form = new FormData(event.currentTarget);
            const updated = {
              title: String(form.get("item_title") ?? ""),
              category: String(form.get("item_category") ?? ""),
              description: String(form.get("item_description") ?? ""),
              mandatory: form.get("mandatory") === "on",
            };
            setItems(
              editing === "new"
                ? [...items, updated]
                : items.map((value, index) =>
                    index === editing ? updated : value,
                  ),
            );
            setEditing(null);
          }}
        >
          <Field
            name="item_title"
            label={t("common.title")}
            maxLength={160}
            initial={item?.title ?? ""}
          />
          <Field
            name="item_category"
            label={t("changes.category")}
            maxLength={80}
            initial={item?.category ?? ""}
          />
          <TextField
            name="item_description"
            label={t("common.description")}
            maxLength={4000}
            initial={item?.description ?? ""}
          />
          <label className="flex items-center gap-2 text-sm">
            <input
              name="mandatory"
              type="checkbox"
              defaultChecked={item?.mandatory ?? true}
            />
            {t("readiness.mandatory")}
          </label>
          <div className="flex gap-2">
            <Button type="submit">{t("readiness.applyItem")}</Button>
            <Button
              type="button"
              variant="ghost"
              onClick={() => setEditing(null)}
            >
              {t("common.cancel")}
            </Button>
          </div>
        </form>
      ) : (
        <Button
          variant="outline"
          disabled={action.busy || items.length >= 100}
          onClick={() => {
            onDirty();
            setEditing("new");
          }}
        >
          {t("readiness.addItem")}
        </Button>
      )}
      {action.error && (
        <p role="alert" className="text-sm text-destructive">
          {action.error}
        </p>
      )}
      <Button
        disabled={action.busy || editing !== null}
        onClick={() => {
          void action.run(async () => {
            await onSave(items);
          });
        }}
      >
        {t("readiness.saveTemplate")}
      </Button>
      {action.error && (
        <Button variant="outline" disabled={action.busy} onClick={onReload}>
          {t("readiness.reloadTemplate")}
        </Button>
      )}
    </div>
  );
}
