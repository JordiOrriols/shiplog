import { afterEach, describe, expect, it } from "vitest";
import { APP_LANGUAGES } from "@jordiorriols/ui";
import i18n from "@/i18n";
import en from "@/locales/en.json";
import { localizeError } from "./localizeError";

afterEach(async () => {
  await i18n.changeLanguage("en");
});

describe("localized server errors", () => {
  it.each(APP_LANGUAGES.map(({ code }) => code))(
    "%s translates all known errors without changing the original error",
    async (code) => {
      await i18n.changeLanguage(code);
      for (const [key, message] of Object.entries(en.errors)) {
        const error = new Error(message, { cause: { code: "42501" } });
        expect(localizeError(error.message)).toBe(
          i18n.getResource(code, "translation", `errors.${key}`),
        );
        expect(error.message).toBe(message);
        expect(error.cause).toEqual({ code: "42501" });
      }
    },
  );

  it("preserves unexpected diagnostics and re-translates stored errors after a language change", async () => {
    await i18n.changeLanguage("ca");
    const message = "Applications with releases cannot be deleted";
    expect(localizeError(message)).toBe(
      "No es poden suprimir aplicacions que tenen versions",
    );
    expect(localizeError("Unexpected server failure: request 123")).toBe(
      "Unexpected server failure: request 123",
    );
    await i18n.changeLanguage("de");
    expect(localizeError(message)).toBe(
      "Anwendungen mit Versionen können nicht gelöscht werden",
    );
  });
});
