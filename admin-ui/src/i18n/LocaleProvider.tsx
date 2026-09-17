import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import zhCN, { Dict as DictType } from "./locales/zh-CN";
import en from "./locales/en";

export type Locale = "zh-CN" | "en";

const DICTIONARIES: Record<Locale, DictType> = {
  "zh-CN": zhCN,
  en: en as DictType,
};

const STORAGE_KEY = "azt.admin.locale";
const SUPPORTED: Locale[] = ["zh-CN", "en"];

function detectInitialLocale(): Locale {
  if (typeof window === "undefined") return "zh-CN";
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored === "zh-CN" || stored === "en") return stored;
  } catch {
    // ignore storage errors
  }
  const navLang = (typeof navigator !== "undefined" && (navigator.language || "")) || "";
  if (navLang.toLowerCase().startsWith("en")) return "en";
  return "zh-CN";
}

type DictPath = string;

type InterpolationValues = Record<string, string | number>;

export interface LocaleContextValue {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: (key: DictPath, values?: InterpolationValues) => string;
}

const LocaleContext = createContext<LocaleContextValue | null>(null);

function getPath(dict: DictType, path: string): unknown {
  const segments = path.split(".");
  let cursor: unknown = dict;
  for (const segment of segments) {
    if (cursor && typeof cursor === "object" && segment in (cursor as Record<string, unknown>)) {
      cursor = (cursor as Record<string, unknown>)[segment];
    } else {
      return undefined;
    }
  }
  return cursor;
}

function interpolate(template: string, values?: InterpolationValues): string {
  if (!values) return template;
  return template.replace(/\{(\w+)\}/g, (match, key: string) => {
    const v = values[key];
    return v === undefined || v === null ? match : String(v);
  });
}

export function LocaleProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(() => detectInitialLocale());

  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, locale);
    } catch {
      // ignore storage errors
    }
    document.documentElement.lang = locale;
  }, [locale]);

  const setLocale = useCallback((next: Locale) => {
    if (SUPPORTED.includes(next)) setLocaleState(next);
  }, []);

  const t = useCallback(
    (key: DictPath, values?: InterpolationValues): string => {
      const primary = getPath(DICTIONARIES[locale], key);
      if (typeof primary === "string") return interpolate(primary, values);
      if (locale !== "zh-CN") {
        const fallback = getPath(DICTIONARIES["zh-CN"], key);
        if (typeof fallback === "string") {
          if (typeof console !== "undefined") {
            console.warn(`[i18n] missing translation for key "${key}" in locale "${locale}", fell back to zh-CN.`);
          }
          return interpolate(fallback, values);
        }
      }
      if (typeof console !== "undefined") {
        console.warn(`[i18n] missing translation for key "${key}".`);
      }
      return key;
    },
    [locale],
  );

  const value = useMemo<LocaleContextValue>(() => ({ locale, setLocale, t }), [locale, setLocale, t]);

  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}

export function useLocale(): LocaleContextValue {
  const ctx = useContext(LocaleContext);
  if (!ctx) {
    throw new Error("useLocale must be used within a LocaleProvider");
  }
  return ctx;
}

export function useT() {
  return useLocale().t;
}

export function useLocaleValue(): Locale {
  return useLocale().locale;
}
