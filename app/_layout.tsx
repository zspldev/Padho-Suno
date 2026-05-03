import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
  useFonts,
} from "@expo-google-fonts/inter";
import { QueryClientProvider } from "@tanstack/react-query";
import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import React, { useEffect, useState } from "react";
import { Platform } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { KeyboardProvider } from "react-native-keyboard-controller";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { queryClient } from "@/lib/query-client";
import { LanguageProvider } from "@/context/LanguageContext";
import { PreferencesProvider } from "@/context/PreferencesContext";
import AppSplashScreen from "@/components/AppSplashScreen";

SplashScreen.preventAutoHideAsync();

const SPLASH_DURATION_MS = 2200;

function RootLayoutNav() {
  return (
    <Stack screenOptions={{ headerBackTitle: "Back" }}>
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
    </Stack>
  );
}

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
  });
  const [splashDone, setSplashDone] = useState(false);

  useEffect(() => {
    if (Platform.OS !== "web") {
      import("expo-av").then(({ Audio }) => {
        Audio.setAudioModeAsync({
          allowsRecordingIOS: false,
          playsInSilentModeIOS: true,
        }).catch(() => {});
      });
    }
  }, []);

  // Native: keep the system splash visible for SPLASH_DURATION_MS, then hide it
  // Web: hide it immediately — the in-app React splash takes over
  useEffect(() => {
    if (!fontsLoaded && !fontError) return;
    if (Platform.OS === "web") {
      SplashScreen.hideAsync();
    } else {
      const t = setTimeout(() => SplashScreen.hideAsync(), SPLASH_DURATION_MS);
      return () => clearTimeout(t);
    }
  }, [fontsLoaded, fontError]);

  if (!fontsLoaded && !fontError) return null;

  // Web: show in-app splash first so it renders before any provider/modal
  if (Platform.OS === "web" && !splashDone) {
    return <AppSplashScreen onFinished={() => setSplashDone(true)} />;
  }

  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <LanguageProvider>
          <PreferencesProvider>
            <GestureHandlerRootView>
              <KeyboardProvider>
                <RootLayoutNav />
              </KeyboardProvider>
            </GestureHandlerRootView>
          </PreferencesProvider>
        </LanguageProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}
