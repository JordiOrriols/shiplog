import { afterEach, describe, expect, it } from "vitest";
import ts from "typescript";
import { APP_LANGUAGES } from "@jordiorriols/ui";
import i18n from "@/i18n";
import en from "./en.json";
import auth from "./auth.json";

type Messages = { [key: string]: string | Messages };
const flatten = (messages: Messages, prefix = ""): [string, string][] =>
  Object.entries(messages).flatMap(([key, value]) =>
    typeof value === "string"
      ? [[prefix + key, value]]
      : flatten(value, `${prefix}${key}.`),
  );
const english = new Map(flatten({ ...en, auth: auth.en }));
const placeholders = (value: string) =>
  [...value.matchAll(/{{\s*(\w+)\s*}}/g)].map((match) => match[1]).sort();

afterEach(async () => {
  await i18n.changeLanguage("en");
});

describe("locale coverage without English fallback", () => {
  it.each(APP_LANGUAGES.map(({ code }) => code))(
    "%s contains every application and authentication message",
    (code) => {
      const bundle: Messages = i18n.getResourceBundle(code, "translation");
      expect(bundle).toBeDefined();
      const messages = new Map(flatten(bundle));
      expect([...messages.keys()].sort()).toEqual([...english.keys()].sort());
      for (const [key, value] of english) {
        expect(messages.get(key)?.trim(), `${code}: ${key}`).toBeTruthy();
        expect(placeholders(messages.get(key)!), `${code}: ${key}`).toEqual(
          placeholders(value),
        );
      }
      if (code !== "en")
        for (const key of [
          "sections.releases",
          "common.save",
          "changes.edit",
          "simple.approve",
          "readiness.templateTitle",
          "portal.filter",
        ])
          expect(messages.get(key), `${code}: ${key}`).not.toBe(
            english.get(key),
          );
    },
  );

  it("resolves every literal translation reference", () => {
    const files = import.meta.glob<string>("../**/*.{ts,tsx}", {
      query: "?raw",
      import: "default",
      eager: true,
    });
    const missing: string[] = [];
    for (const [file, text] of Object.entries(files)) {
      if (file.includes(".test.") || file.includes(".spec.")) continue;
      const source = ts.createSourceFile(
        file,
        text,
        ts.ScriptTarget.Latest,
        true,
      );
      function visit(node: ts.Node) {
        if (
          ts.isCallExpression(node) &&
          ["t", "i18n.t"].includes(node.expression.getText(source)) &&
          node.arguments[0] &&
          ts.isStringLiteralLike(node.arguments[0])
        ) {
          const key = node.arguments[0].text;
          if (
            !english.has(key) &&
            !english.has(`${key}_one`) &&
            !english.has(`${key}_other`)
          )
            missing.push(`${file}: ${key}`);
        }
        ts.forEachChild(node, visit);
      }
      visit(source);
    }
    expect(missing).toEqual([]);
  });

  it.each([
    ["ca-ES", "ca", "Versions"],
    ["es-ES", "es", "Versiones"],
    ["fr-FR", "fr", "Versions"],
    ["de-DE", "de", "Versionen"],
    ["it-IT", "it", "Versioni"],
    ["ja-JP", "en", "Releases"],
  ])(
    "resolves %s and sets the document language",
    async (requested, resolved, label) => {
      await i18n.changeLanguage(requested);
      expect(i18n.resolvedLanguage).toBe(resolved);
      expect(document.documentElement.lang).toBe(resolved);
      expect(i18n.t("sections.releases")).toBe(label);
    },
  );
});
