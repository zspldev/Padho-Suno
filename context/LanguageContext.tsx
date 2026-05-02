import React, { createContext, useContext, useState, useEffect, useCallback } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";

export type LangCode = string;

export interface LangOption {
  code: LangCode;
  label: string;
  nativeLabel: string;
}

export const LANG_OPTIONS: LangOption[] = [
  { code: "as",  label: "Assamese",  nativeLabel: "অসমীয়া" },
  { code: "bn",  label: "Bengali",   nativeLabel: "বাংলা" },
  { code: "brx", label: "Bodo",      nativeLabel: "बड़ो" },
  { code: "doi", label: "Dogri",     nativeLabel: "डोगरी" },
  { code: "en",  label: "English",   nativeLabel: "English" },
  { code: "gu",  label: "Gujarati",  nativeLabel: "ગુજરાતી" },
  { code: "hi",  label: "Hindi",     nativeLabel: "हिंदी" },
  { code: "kn",  label: "Kannada",   nativeLabel: "ಕನ್ನಡ" },
  { code: "ks",  label: "Kashmiri",  nativeLabel: "کٲشُر" },
  { code: "kok", label: "Konkani",   nativeLabel: "कोंकणी" },
  { code: "mai", label: "Maithili",  nativeLabel: "मैथिली" },
  { code: "ml",  label: "Malayalam", nativeLabel: "മലയാളം" },
  { code: "mni", label: "Manipuri",  nativeLabel: "মৈতৈলোন্" },
  { code: "mr",  label: "Marathi",   nativeLabel: "मराठी" },
  { code: "ne",  label: "Nepali",    nativeLabel: "नेपाली" },
  { code: "or",  label: "Odia",      nativeLabel: "ଓଡ଼ିଆ" },
  { code: "pa",  label: "Punjabi",   nativeLabel: "ਪੰਜਾਬੀ" },
  { code: "sa",  label: "Sanskrit",  nativeLabel: "संस्कृत" },
  { code: "sd",  label: "Sindhi",    nativeLabel: "سنڌي" },
  { code: "ta",  label: "Tamil",     nativeLabel: "தமிழ்" },
  { code: "te",  label: "Telugu",    nativeLabel: "తెలుగు" },
  { code: "ur",  label: "Urdu",      nativeLabel: "اردو" },
];

interface LanguageContextValue {
  preferredLang: LangCode;
  setPreferredLang: (lang: LangCode) => void;
  getLangOption: (code: string) => LangOption;
  hasPickedLanguage: boolean;
  markLanguagePicked: () => void;
}

const LanguageContext = createContext<LanguageContextValue>({
  preferredLang: "hi",
  setPreferredLang: () => {},
  getLangOption: () => LANG_OPTIONS[6],
  hasPickedLanguage: false,
  markLanguagePicked: () => {},
});

const STORAGE_KEY = "@padhosuno_preferred_lang";
const PICKED_KEY  = "@padhosuno_lang_picked";

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [preferredLang, setPreferredLangState] = useState<LangCode>("hi");
  const [hasPickedLanguage, setHasPickedLanguage] = useState<boolean>(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    Promise.all([
      AsyncStorage.getItem(STORAGE_KEY),
      AsyncStorage.getItem(PICKED_KEY),
    ]).then(([lang, picked]) => {
      if (lang && LANG_OPTIONS.some((o) => o.code === lang)) {
        setPreferredLangState(lang);
      }
      setHasPickedLanguage(picked === "true");
      setLoaded(true);
    });
  }, []);

  const setPreferredLang = useCallback((lang: LangCode) => {
    setPreferredLangState(lang);
    AsyncStorage.setItem(STORAGE_KEY, lang);
  }, []);

  const markLanguagePicked = useCallback(() => {
    setHasPickedLanguage(true);
    AsyncStorage.setItem(PICKED_KEY, "true");
  }, []);

  const getLangOption = useCallback((code: string): LangOption => {
    return LANG_OPTIONS.find((o) => o.code === code) ?? LANG_OPTIONS[6];
  }, []);

  if (!loaded) return null;

  return (
    <LanguageContext.Provider value={{ preferredLang, setPreferredLang, getLangOption, hasPickedLanguage, markLanguagePicked }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  return useContext(LanguageContext);
}
