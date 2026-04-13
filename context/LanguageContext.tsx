import React, { createContext, useContext, useState, useEffect, useCallback } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";

export type LangCode = "hi" | "mr" | "gu" | "en";

export interface LangOption {
  code: LangCode;
  label: string;
  nativeLabel: string;
}

export const LANG_OPTIONS: LangOption[] = [
  { code: "hi", label: "Hindi",   nativeLabel: "हिंदी" },
  { code: "mr", label: "Marathi", nativeLabel: "मराठी" },
  { code: "gu", label: "Gujarati",nativeLabel: "ગુજ" },
  { code: "en", label: "English", nativeLabel: "Eng" },
];

interface LanguageContextValue {
  preferredLang: LangCode;
  setPreferredLang: (lang: LangCode) => void;
  getLangOption: (code: string) => LangOption;
}

const LanguageContext = createContext<LanguageContextValue>({
  preferredLang: "hi",
  setPreferredLang: () => {},
  getLangOption: () => LANG_OPTIONS[0],
});

const STORAGE_KEY = "@padhosuno_preferred_lang";

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [preferredLang, setPreferredLangState] = useState<LangCode>("hi");

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY).then((val) => {
      if (val && ["hi", "mr", "gu", "en"].includes(val)) {
        setPreferredLangState(val as LangCode);
      }
    });
  }, []);

  const setPreferredLang = useCallback((lang: LangCode) => {
    setPreferredLangState(lang);
    AsyncStorage.setItem(STORAGE_KEY, lang);
  }, []);

  const getLangOption = useCallback((code: string): LangOption => {
    return LANG_OPTIONS.find((o) => o.code === code) ?? LANG_OPTIONS[0];
  }, []);

  return (
    <LanguageContext.Provider value={{ preferredLang, setPreferredLang, getLangOption }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  return useContext(LanguageContext);
}
