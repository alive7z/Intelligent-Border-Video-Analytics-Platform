import { useCallback, useEffect, useState } from "react";

// Lightweight language state that is i18next/react-i18next ready.
// This project has no translation files yet, so UI strings are English-only.
// To add Hindi later: install react-i18next, create locales, and translate
// only general labels (security terminology should be decided with domain
// experts before translating).

const STORAGE_KEY = "ibvap_lang";

export function useLanguage() {
  const [lang, setLang] = useState(
    () => localStorage.getItem(STORAGE_KEY) || "en"
  );

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, lang);
    document.documentElement.lang = lang;
  }, [lang]);

  const toggle = useCallback(() => {
    setLang((prev) => (prev === "en" ? "hi" : "en"));
  }, []);

  return { lang, setLang, toggle };
}

// Supported languages (translation files not yet defined).
export const SUPPORTED_LANGUAGES = [
  { code: "en", label: "English" },
  { code: "hi", label: "हिन्दी" },
];
