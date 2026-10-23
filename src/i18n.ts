import { useSyncExternalStore } from "react";
import en from "./locales/en.json";
import zh from "./locales/zh-CN.json";

export type Locale = "zh-CN" | "en";
const storageKey = "conest.locale";
export function resolveLocale(
  saved: string | null,
  languages: readonly string[],
): Locale {
  if (saved === "zh-CN" || saved === "en") return saved;
  return languages[0]?.toLowerCase().startsWith("zh") ? "zh-CN" : "en";
}
function initialLocale(): Locale {
  if (typeof navigator === "undefined") return "en";
  let saved = null;
  try {
    saved = localStorage.getItem(storageKey);
  } catch {
    /* Storage may be disabled. */
  }
  return resolveLocale(saved, navigator.languages);
}
let locale = initialLocale();
const listeners = new Set<() => void>();
export const getLocale = () => locale;
export function translate(
  language: Locale,
  key: string,
  values: Record<string, string | number> = {},
): string {
  const dictionary: Record<string, string> = language === "en" ? en : zh;
  const value = dictionary[key] ?? key;
  return value.replace(/\{(\w+)\}/g, (placeholder, name) =>
    Object.hasOwn(values, name) ? String(values[name]) : placeholder,
  );
}
export const tr = (key: string, values?: Record<string, string | number>) =>
  translate(locale, key, values);
function updateDocument() {
  if (typeof document === "undefined") return;
  document.documentElement.lang = locale;
  document.title = tr("conest — 一起把想法做出来");
}
export function setLocale(next: Locale) {
  if (next === locale) return;
  locale = next;
  try {
    localStorage.setItem(storageKey, next);
  } catch {
    /* Keep the in-memory preference. */
  }
  updateDocument();
  listeners.forEach((listener) => listener());
}
export function useLocale() {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    getLocale,
    () => "en" as Locale,
  );
}
if (typeof window !== "undefined") {
  updateDocument();
  window.addEventListener("storage", (event) => {
    if (event.key === storageKey)
      setLocale(resolveLocale(event.newValue, navigator.languages));
  });
}

// Keep API messages stable for clients; translate known failures at the UI boundary.
export function localizeError(message: string): string {
  if (message.startsWith("Validation failed"))
    return tr("请检查输入内容是否符合要求。");
  if (message.startsWith("Version conflict"))
    return tr("文件已被更新，请读取最新版本后再保存。");
  return tr(message);
}
