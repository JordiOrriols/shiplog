import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import LanguageDetector from "i18next-browser-languagedetector";
import en from "./locales/en.json";
import auth from "./locales/auth.json";

i18n.on("languageChanged", (language: string) => {
  if (typeof document !== "undefined") document.documentElement.lang = language;
});
i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      en: { translation: { ...en, auth: auth.en } },
      es: { translation: { auth: auth.es } },
      ca: { translation: { auth: auth.ca } },
      fr: { translation: { auth: auth.fr } },
      de: { translation: { auth: auth.de } },
      it: { translation: { auth: auth.it } },
    },
    fallbackLng: "en",
    interpolation: { escapeValue: false },
    detection: {
      order: ["localStorage", "navigator"],
      caches: ["localStorage"],
    },
  });
export default i18n;
