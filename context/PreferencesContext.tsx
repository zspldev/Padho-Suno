import React, { createContext, useContext, useState, useEffect, useCallback } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";

export type TextSizeKey = "small" | "medium" | "large" | "xlarge";

export const TEXT_SIZE_OPTIONS: { key: TextSizeKey; label: string; scale: number }[] = [
  { key: "small",  label: "Small",   scale: 0.85 },
  { key: "medium", label: "Medium",  scale: 1.0  },
  { key: "large",  label: "Large",   scale: 1.2  },
  { key: "xlarge", label: "X-Large", scale: 1.45 },
];

export const SPEED_OPTIONS_PREF = [0.75, 1, 1.25, 1.5, 2];

interface PreferencesContextValue {
  textSize: TextSizeKey;
  setTextSize: (size: TextSizeKey) => void;
  fontScale: number;
  defaultSpeed: number;
  setDefaultSpeed: (speed: number) => void;
}

const PreferencesContext = createContext<PreferencesContextValue>({
  textSize: "medium",
  setTextSize: () => {},
  fontScale: 1.0,
  defaultSpeed: 1,
  setDefaultSpeed: () => {},
});

const TEXT_SIZE_KEY   = "@padhosuno_text_size";
const DEFAULT_SPEED_KEY = "@padhosuno_default_speed";

export function PreferencesProvider({ children }: { children: React.ReactNode }) {
  const [textSize, setTextSizeState] = useState<TextSizeKey>("medium");
  const [defaultSpeed, setDefaultSpeedState] = useState<number>(1);

  useEffect(() => {
    Promise.all([
      AsyncStorage.getItem(TEXT_SIZE_KEY),
      AsyncStorage.getItem(DEFAULT_SPEED_KEY),
    ]).then(([size, speed]) => {
      if (size && TEXT_SIZE_OPTIONS.some((o) => o.key === size)) {
        setTextSizeState(size as TextSizeKey);
      }
      if (speed) {
        const parsed = parseFloat(speed);
        if (SPEED_OPTIONS_PREF.includes(parsed)) setDefaultSpeedState(parsed);
      }
    });
  }, []);

  const setTextSize = useCallback((size: TextSizeKey) => {
    setTextSizeState(size);
    AsyncStorage.setItem(TEXT_SIZE_KEY, size);
  }, []);

  const setDefaultSpeed = useCallback((speed: number) => {
    setDefaultSpeedState(speed);
    AsyncStorage.setItem(DEFAULT_SPEED_KEY, String(speed));
  }, []);

  const fontScale = TEXT_SIZE_OPTIONS.find((o) => o.key === textSize)?.scale ?? 1.0;

  return (
    <PreferencesContext.Provider value={{ textSize, setTextSize, fontScale, defaultSpeed, setDefaultSpeed }}>
      {children}
    </PreferencesContext.Provider>
  );
}

export function usePreferences() {
  return useContext(PreferencesContext);
}
