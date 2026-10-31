import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import LanguageDetector from "i18next-browser-languagedetector";
import en from "./locales/en.json";
import es from "./locales/es.json";
import ca from "./locales/ca.json";
import fr from "./locales/fr.json";
import de from "./locales/de.json";
import it from "./locales/it.json";
import auth from "./locales/auth.json";

const resources = {
  en: { translation: { ...en, auth: auth.en } },
  es: { translation: { ...es, auth: auth.es } },
  ca: { translation: { ...ca, auth: auth.ca } },
  fr: { translation: { ...fr, auth: auth.fr } },
  de: { translation: { ...de, auth: auth.de } },
  it: { translation: { ...it, auth: auth.it } },
};

function updateDocumentLanguage() {
  if (typeof document !== "undefined")
    document.documentElement.lang = i18n.resolvedLanguage ?? "en";
}
i18n.on("languageChanged", updateDocumentLanguage);
i18n.on("initialized", updateDocumentLanguage);
i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources,
    supportedLngs: Object.keys(resources),
    nonExplicitSupportedLngs: true,
    fallbackLng: "en",
    interpolation: { escapeValue: false },
    detection: {
      order: ["localStorage", "navigator"],
      caches: ["localStorage"],
    },
  });
export default i18n;
