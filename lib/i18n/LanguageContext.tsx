"use client";

import React, { createContext, useContext, useEffect, useState } from "react";
import { Language, dict } from "./dictionaries";

type LanguageContextType = {
  language: Language;
  setLanguage: (lang: Language) => void;
  t: typeof dict.en;
};

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  // Server and first client render always use "en" (matching state below), so
  // there is no hydration mismatch. The saved/detected language is applied in
  // the effect after mount — a normal client update, no need to hide the app.
  const [language, setLanguageState] = useState<Language>("en");

  useEffect(() => {
    // 1. Check local storage first
    const saved = localStorage.getItem("vyas-language") as Language;
    if (saved && (saved === "en" || saved === "hi")) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setLanguageState(saved);
    } else if (typeof navigator !== "undefined") {
      // 2. Auto-detect from browser
      const browserLang = navigator.language.toLowerCase();
      if (browserLang.startsWith("hi")) {
        setLanguageState("hi");
      }
    }
  }, []);

  const setLanguage = (lang: Language) => {
    setLanguageState(lang);
    localStorage.setItem("vyas-language", lang);
  };

  const t = dict[language];

  return (
    <LanguageContext.Provider value={{ language, setLanguage, t }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  const context = useContext(LanguageContext);
  if (context === undefined) {
    throw new Error("useLanguage must be used within a LanguageProvider");
  }
  return context;
}
