import i18n from "@/i18n";
import en from "@/locales/en.json";

const errorKeys = new Map(
  Object.entries(en.errors).map(([key, message]) => [message, `errors.${key}`]),
);

export function localizeError(message: string): string {
  const key = errorKeys.get(message);
  return key ? i18n.t(key) : message;
}
