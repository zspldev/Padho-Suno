import React, { useState, useCallback, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  ActivityIndicator,
  Platform,
  Alert,
  Animated,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import * as Speech from "expo-speech";
import * as Haptics from "expo-haptics";
import { LinearGradient } from "expo-linear-gradient";
import { useQueryClient } from "@tanstack/react-query";
import Colors from "@/constants/colors";
import { uploadScanImage, apiRequest } from "@/lib/query-client";
import { useAudio, SPEED_OPTIONS } from "@/hooks/useAudio";
import { useLanguage } from "@/context/LanguageContext";
import LanguagePickerModal from "@/components/LanguagePickerModal";

type ScanState = "idle" | "loading" | "result" | "error";

interface ScanResult {
  id: number;
  extractedText: string;
  detectedLanguage: string;
  languageLabel: string;
  demoMode: boolean;
}

function estimateReadingTime(text: string): string {
  const words = text.trim().split(/\s+/).length;
  const minutes = Math.ceil(words / 140);
  return minutes === 1 ? "~1 min read" : `~${minutes} min read`;
}

export default function ScanScreen() {
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();

  const [scanState, setScanState] = useState<ScanState>("idle");
  const [scanResult, setScanResult] = useState<ScanResult | null>(null);
  const [errorMessage, setErrorMessage] = useState("");
  const [ttsLoading, setTtsLoading] = useState<string | null>(null);
  const [demoSpeaking, setDemoSpeaking] = useState(false);
  const [preferredTranslatedText, setPreferredTranslatedText] = useState<string | null>(null);
  const [hindiTranslatedText, setHindiTranslatedText] = useState<string | null>(null);
  const [activeReadMode, setActiveReadMode] = useState<string | null>(null);
  const [showLangPicker, setShowLangPicker] = useState(false);
  const scaleAnim = useRef(new Animated.Value(1)).current;

  const { preferredLang, setPreferredLang, getLangOption, hasPickedLanguage, markLanguagePicked } = useLanguage();
  const { audioState, speed, playBase64Audio, pause, resume, replay, setSpeed, reset } = useAudio();

  const handlePressIn = () => {
    Animated.spring(scaleAnim, { toValue: 0.93, useNativeDriver: true }).start();
  };
  const handlePressOut = () => {
    Animated.spring(scaleAnim, { toValue: 1, useNativeDriver: true }).start();
  };

  const handleLanguagePicked = useCallback((lang: string) => {
    setPreferredLang(lang);
    if (!hasPickedLanguage) markLanguagePicked();
    setShowLangPicker(false);
  }, [setPreferredLang, markLanguagePicked, hasPickedLanguage]);

  const openImagePicker = useCallback(
    async (useCamera: boolean) => {
      try {
        if (useCamera) {
          const { status } = await ImagePicker.requestCameraPermissionsAsync();
          if (status !== "granted") {
            Alert.alert("Permission needed", "Camera access is required to scan documents.");
            return;
          }
        }

        const result = useCamera
          ? await ImagePicker.launchCameraAsync({ mediaTypes: ["images"], quality: 0.8, allowsEditing: false })
          : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], quality: 0.8, allowsEditing: false });

        if (result.canceled || !result.assets[0]) return;

        await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        setScanState("loading");
        setErrorMessage("");
        setScanResult(null);
        setPreferredTranslatedText(null);
        setHindiTranslatedText(null);
        setActiveReadMode(null);
        reset();

        const imageUri = result.assets[0].uri;
        const data = await uploadScanImage(imageUri);

        queryClient.invalidateQueries({ queryKey: ["/api/scans"] });
        setScanResult(data);
        setScanState("result");
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      } catch (err: any) {
        setScanState("error");
        setErrorMessage(err.message?.replace(/^\d+:\s*/, "") || "Something went wrong. Please try again.");
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      }
    },
    [queryClient, reset]
  );

  const handleScanButton = useCallback(() => {
    if (Platform.OS === "web") {
      openImagePicker(false);
    } else {
      Alert.alert("Scan Document", "Choose how to capture the document", [
        { text: "Take Photo", onPress: () => openImagePicker(true) },
        { text: "Choose from Gallery", onPress: () => openImagePicker(false) },
        { text: "Cancel", style: "cancel" },
      ]);
    }
  }, [openImagePicker]);

  const doTts = useCallback(async (text: string, lang: string, modeKey: string) => {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setTtsLoading(modeKey);
    setActiveReadMode(modeKey);
    try {
      const res = await apiRequest("POST", "/api/tts", { text, language: lang });
      const data = (await res.json()) as {
        ttsAudioBase64: string | null;
        audioUrl?: string;
        audioFormat?: string;
        demoMode: boolean;
      };

      if (data.ttsAudioBase64 && data.audioUrl) {
        await playBase64Audio(data.ttsAudioBase64, data.audioUrl, speed, data.audioFormat);
      } else {
        setDemoSpeaking(true);
        if (Platform.OS === "web") {
          const utterance = new SpeechSynthesisUtterance(text);
          utterance.lang = lang === "en" ? "en-IN" : "hi-IN";
          utterance.rate = 0.85;
          utterance.onend = () => setDemoSpeaking(false);
          window.speechSynthesis.speak(utterance);
        } else {
          Speech.speak(text, {
            language: lang === "en" ? "en-IN" : "hi-IN",
            rate: 0.85,
            onDone: () => setDemoSpeaking(false),
            onError: () => setDemoSpeaking(false),
          });
        }
      }
    } catch (err: any) {
      setDemoSpeaking(false);
      setActiveReadMode(null);
      Alert.alert("Error", err.message || "Could not load audio");
    } finally {
      setTtsLoading(null);
    }
  }, [playBase64Audio, speed]);

  const translateAndRead = useCallback(async (targetLang: string, modeKey: string) => {
    if (!scanResult) return;

    if (scanResult.detectedLanguage === targetLang) {
      await doTts(scanResult.extractedText, targetLang, modeKey);
      return;
    }

    setTtsLoading(modeKey);
    setActiveReadMode(modeKey);
    try {
      const tRes = await apiRequest("POST", "/api/translate", {
        text: scanResult.extractedText,
        sourceLanguage: scanResult.detectedLanguage,
        targetLanguage: targetLang,
      });
      const tData = (await tRes.json()) as { translatedText: string; skipped: boolean };
      const textToRead = tData.skipped ? scanResult.extractedText : tData.translatedText;
      const langToRead = tData.skipped ? scanResult.detectedLanguage : targetLang;

      if (modeKey === "hindi") {
        setHindiTranslatedText(tData.skipped ? null : tData.translatedText);
      } else if (modeKey.startsWith("preferred-")) {
        setPreferredTranslatedText(tData.skipped ? null : tData.translatedText);
      }

      setTtsLoading(null);
      await doTts(textToRead, langToRead, modeKey);
    } catch (err: any) {
      setTtsLoading(null);
      setActiveReadMode(null);
      Alert.alert("Error", err.message || "Could not translate");
    }
  }, [scanResult, doTts]);

  const handleReadOriginal = useCallback(async () => {
    if (!scanResult) return;
    await doTts(scanResult.extractedText, scanResult.detectedLanguage, "original");
  }, [scanResult, doTts]);

  const handleReadPreferred = useCallback(async () => {
    if (!scanResult) return;
    await translateAndRead(preferredLang, `preferred-${preferredLang}`);
  }, [scanResult, preferredLang, translateAndRead]);

  const handleReadHindi = useCallback(async () => {
    if (!scanResult) return;
    await translateAndRead("hi", "hindi");
  }, [scanResult, translateAndRead]);

  const handlePauseResume = useCallback(async () => {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (audioState === "playing") await pause();
    else if (audioState === "paused") await resume();
  }, [audioState, pause, resume]);

  const handleReplay = useCallback(async () => {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (audioState !== "idle" || demoSpeaking) {
      setDemoSpeaking(false);
      if (Platform.OS !== "web") Speech.stop();
      else window.speechSynthesis?.cancel();
      await replay();
    } else {
      await replay();
    }
  }, [audioState, demoSpeaking, replay]);

  const handleSpeedChange = useCallback(async (s: number) => {
    await Haptics.selectionAsync();
    await setSpeed(s);
  }, [setSpeed]);

  const handleScanAnother = useCallback(async () => {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    reset();
    setDemoSpeaking(false);
    setActiveReadMode(null);
    if (Platform.OS !== "web") Speech.stop();
    else window.speechSynthesis?.cancel();
    setScanState("idle");
    setScanResult(null);
    setErrorMessage("");
    setPreferredTranslatedText(null);
    setHindiTranslatedText(null);
  }, [reset]);

  const stopAudio = useCallback(async () => {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setDemoSpeaking(false);
    setActiveReadMode(null);
    if (Platform.OS !== "web") Speech.stop();
    else window.speechSynthesis?.cancel();
    reset();
  }, [reset]);

  const isAudioActive = audioState === "playing" || audioState === "paused" || demoSpeaking;
  const topInset = Platform.OS === "web" ? 67 : insets.top;

  const preferredLangOption = getLangOption(preferredLang);

  return (
    <View style={styles.container}>
      <LanguagePickerModal
        visible={!hasPickedLanguage || showLangPicker}
        isFirstLaunch={!hasPickedLanguage}
        currentLang={preferredLang}
        onSelect={handleLanguagePicked}
        onDismiss={() => setShowLangPicker(false)}
      />

      <View style={[styles.headerBar, { paddingTop: topInset + 8 }]}>
        <Pressable
          style={styles.headerIconBtn}
          hitSlop={12}
          aria-label="Menu"
          testID="menu-button"
        >
          <Ionicons name="menu" size={26} color={Colors.text} />
        </Pressable>

        <Text style={styles.headerTitle}>PadhoSuno</Text>

        <Pressable
          style={styles.langPill}
          onPress={() => setShowLangPicker(true)}
          hitSlop={8}
          testID="language-pill"
        >
          <Ionicons name="language-outline" size={14} color={Colors.saffron} />
          <Text style={styles.langPillText} numberOfLines={1}>
            {preferredLangOption.nativeLabel}
          </Text>
          <Ionicons name="chevron-down" size={12} color={Colors.saffron} />
        </Pressable>
      </View>

      {scanResult?.demoMode && (
        <View style={styles.demoBanner}>
          <Ionicons name="information-circle" size={16} color={Colors.blue} />
          <Text style={styles.demoBannerText}>
            Demo mode — add GOOGLE_CLOUD_API_KEY for real OCR
          </Text>
        </View>
      )}

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        contentInsetAdjustmentBehavior="automatic"
      >
        {scanState === "idle" && (
          <View style={styles.idleContainer}>
            <Text style={styles.tagline}>पढ़ो सुनो — Photo लो, सुनो</Text>

            <Animated.View style={{ transform: [{ scale: scaleAnim }] }}>
              <Pressable
                onPress={handleScanButton}
                onPressIn={handlePressIn}
                onPressOut={handlePressOut}
                aria-label="Scan document"
                testID="scan-button"
                style={styles.scanButtonWrapper}
              >
                <LinearGradient colors={[Colors.saffron, Colors.saffronDark]} style={styles.scanButton}>
                  <Ionicons name="camera" size={52} color={Colors.white} />
                </LinearGradient>
              </Pressable>
            </Animated.View>

            <Text style={styles.scanLabel}>Scan Document</Text>
            <Pressable
              onPress={() => openImagePicker(false)}
              hitSlop={16}
              style={styles.galleryLink}
            >
              <Ionicons name="images-outline" size={16} color={Colors.textSecondary} />
              <Text style={styles.galleryLinkText}>Upload from gallery</Text>
            </Pressable>

            <View style={styles.helpCards}>
              {[
                { icon: "camera-outline" as const, title: "Capture", desc: "Point camera at any document" },
                { icon: "text-outline" as const, title: "Extract", desc: "AI reads the text for you" },
                { icon: "volume-high-outline" as const, title: "Listen", desc: "Hear the document read aloud" },
              ].map((item, i) => (
                <View key={i} style={styles.helpCard}>
                  <View style={styles.helpIconCircle}>
                    <Ionicons name={item.icon} size={22} color={Colors.saffron} />
                  </View>
                  <Text style={styles.helpCardTitle}>{item.title}</Text>
                  <Text style={styles.helpCardDesc}>{item.desc}</Text>
                </View>
              ))}
            </View>
          </View>
        )}

        {scanState === "loading" && (
          <View style={styles.loadingContainer} aria-live="polite">
            <View style={styles.loadingCard}>
              <ActivityIndicator size="large" color={Colors.saffron} />
              <Text style={styles.loadingText}>Reading your document...</Text>
              <Text style={styles.loadingSubtext}>This may take a moment</Text>
            </View>
          </View>
        )}

        {scanState === "error" && (
          <View style={styles.errorContainer} aria-live="polite">
            <View style={styles.errorCard}>
              <Ionicons name="alert-circle" size={48} color={Colors.error} />
              <Text style={styles.errorTitle}>Could not read document</Text>
              <Text style={styles.errorMessage}>{errorMessage}</Text>
              <Pressable onPress={() => setScanState("idle")} style={styles.retryButton}>
                <Ionicons name="refresh" size={18} color={Colors.white} />
                <Text style={styles.retryButtonText}>Try Again</Text>
              </Pressable>
            </View>
          </View>
        )}

        {scanState === "result" && scanResult && (
          <View style={styles.resultContainer} aria-live="polite">
            <View style={styles.resultMeta}>
              <View style={styles.langBadge}>
                <Text style={styles.langBadgeText}>
                  {getLangOption(scanResult.detectedLanguage).label || scanResult.languageLabel}
                </Text>
              </View>
              <View style={styles.readTimeBadge}>
                <Ionicons name="time-outline" size={14} color={Colors.textSecondary} />
                <Text style={styles.readTimeText}>{estimateReadingTime(scanResult.extractedText)}</Text>
              </View>
            </View>

            <View style={styles.textBlock}>
              <Text style={styles.textBlockLabel}>
                Original — {getLangOption(scanResult.detectedLanguage).label || scanResult.languageLabel}
              </Text>
              <ScrollView nestedScrollEnabled showsVerticalScrollIndicator style={styles.textScroll}>
                <Text style={styles.extractedText} selectable aria-label="Extracted text">
                  {scanResult.extractedText}
                </Text>
              </ScrollView>
            </View>

            {/* Box 2 — synced translation: shows the script matching the active listen option */}
            {(() => {
              const showingHindi    = activeReadMode === "hindi";
              const showingPref     = activeReadMode?.startsWith("preferred-") ?? false;
              const showBox         = showingHindi || showingPref;
              if (!showBox) return null;

              const isLoadingBox    = ttsLoading === (showingHindi ? "hindi" : `preferred-${preferredLang}`);
              const boxText         = showingHindi ? hindiTranslatedText : preferredTranslatedText;
              const boxLangLabel    = showingHindi ? "Hindi" : preferredLangOption.label;
              const boxNativeLabel  = showingHindi ? "हिंदी" : preferredLangOption.nativeLabel;
              const accentColor     = showingHindi ? Colors.green : Colors.indigo;
              const accentLight     = showingHindi ? Colors.greenLight : Colors.indigoLight;

              return (
                <View style={[styles.translationBlock, { borderColor: accentColor + "40", backgroundColor: accentLight }]}>
                  <View style={styles.translationHeader}>
                    <Ionicons name="language" size={15} color={accentColor} />
                    <Text style={[styles.translationLabel, { color: accentColor }]}>
                      {boxNativeLabel}
                    </Text>
                    <Text style={styles.translationLabelSub}>· Translated · {boxLangLabel}</Text>
                    {isLoadingBox && <ActivityIndicator size="small" color={accentColor} style={{ marginLeft: 4 }} />}
                  </View>
                  {boxText ? (
                    <ScrollView nestedScrollEnabled showsVerticalScrollIndicator style={styles.textScroll}>
                      <Text style={styles.extractedText} selectable aria-label="Translated text">
                        {boxText}
                      </Text>
                    </ScrollView>
                  ) : isLoadingBox ? (
                    <Text style={[styles.translationPlaceholder, { color: accentColor }]}>Translating…</Text>
                  ) : null}
                </View>
              );
            })()}

            {/* ── Listen panel — always visible, options never disappear ── */}
            <View style={styles.listenPanel}>
              <Text style={styles.listenSectionLabel}>Listen to document</Text>

              {/* Option 1 — original language · saffron */}
              {(() => {
                const mk = "original";
                const isActive = activeReadMode === mk && isAudioActive;
                const isLoading = ttsLoading === mk;
                const isPlaying = isActive && (audioState === "playing" || demoSpeaking);
                const otherLoading = ttsLoading !== null && !isLoading;
                const detectedOpt = getLangOption(scanResult.detectedLanguage);
                return (
                  <View style={[styles.listenCard, styles.listenCardBorderOrange, isActive && styles.listenCardActiveOrange]}>
                    <Pressable
                      onPress={isActive ? undefined : handleReadOriginal}
                      disabled={otherLoading || isLoading}
                      style={({ pressed }) => [{ opacity: pressed && !isActive ? 0.8 : 1 }]}
                      testID="listen-original-button"
                    >
                      <View style={styles.listenCardRow}>
                        <View style={[styles.listenCardIcon, styles.listenCardIconOrange, isActive && styles.listenCardIconActiveOrange]}>
                          {isLoading
                            ? <ActivityIndicator size="small" color={isActive ? Colors.white : Colors.saffron} />
                            : <Ionicons name="volume-high" size={20} color={isActive ? Colors.white : Colors.saffron} />}
                        </View>
                        <View style={styles.listenCardText}>
                          <Text style={[styles.listenCardTitle, { color: isActive ? Colors.white : Colors.saffron }]}>
                            {isLoading ? "Preparing audio..." : detectedOpt.nativeLabel}
                          </Text>
                          <Text style={[styles.listenCardSub, isActive && { color: "rgba(255,255,255,0.8)" }]}>
                            Original · {detectedOpt.label}
                          </Text>
                        </View>
                        {!isActive && !isLoading && (
                          <Ionicons name="play-circle" size={32} color={Colors.saffron} />
                        )}
                      </View>
                    </Pressable>
                    {isActive && (
                      <View style={styles.listenCardControls}>
                        <View style={styles.listenCardControlsRow}>
                          <Pressable onPress={handlePauseResume} style={styles.lcBtn} aria-label={isPlaying ? "Pause" : "Resume"}>
                            <Ionicons name={isPlaying ? "pause-circle" : "play-circle"} size={40} color={Colors.white} />
                          </Pressable>
                          <Pressable onPress={handleReplay} style={styles.lcSecBtn}>
                            <Ionicons name="refresh" size={18} color={Colors.white} />
                            <Text style={styles.lcSecBtnText}>Replay</Text>
                          </Pressable>
                          <Pressable onPress={stopAudio} style={styles.lcSecBtn}>
                            <Ionicons name="stop-circle-outline" size={18} color="rgba(255,255,255,0.7)" />
                            <Text style={[styles.lcSecBtnText, { color: "rgba(255,255,255,0.7)" }]}>Stop</Text>
                          </Pressable>
                        </View>
                        {!demoSpeaking && (
                          <View style={styles.speedRow}>
                            <Text style={styles.speedLabel}>Speed</Text>
                            {SPEED_OPTIONS.map((s) => (
                              <Pressable key={s} onPress={() => handleSpeedChange(s)}
                                style={[styles.speedChipLight, speed === s && styles.speedChipLightActive]} hitSlop={8}>
                                <Text style={[styles.speedChipLightText, speed === s && styles.speedChipLightTextActive]}>{s}x</Text>
                              </Pressable>
                            ))}
                          </View>
                        )}
                      </View>
                    )}
                  </View>
                );
              })()}

              {/* Option 2 — preferred language · indigo */}
              {(() => {
                const mk = `preferred-${preferredLang}`;
                const isActive = activeReadMode === mk && isAudioActive;
                const isLoading = ttsLoading === mk;
                const isPlaying = isActive && (audioState === "playing" || demoSpeaking);
                const otherLoading = ttsLoading !== null && !isLoading;
                return (
                  <View style={[styles.listenCard, styles.listenCardBorderIndigo, isActive && styles.listenCardActiveIndigo]}>
                    <Pressable
                      onPress={isActive ? undefined : handleReadPreferred}
                      disabled={otherLoading || isLoading}
                      style={({ pressed }) => [{ opacity: pressed && !isActive ? 0.8 : 1 }]}
                      testID="listen-preferred-button"
                    >
                      <View style={styles.listenCardRow}>
                        <View style={[styles.listenCardIcon, styles.listenCardIconPref, isActive && styles.listenCardIconActiveIndigo]}>
                          {isLoading
                            ? <ActivityIndicator size="small" color={isActive ? Colors.white : Colors.indigo} />
                            : <Ionicons name="language" size={20} color={isActive ? Colors.white : Colors.indigo} />}
                        </View>
                        <View style={styles.listenCardText}>
                          <Text style={[styles.listenCardTitle, { color: isActive ? Colors.white : Colors.indigo }]}>
                            {isLoading ? "Translating & preparing..." : preferredLangOption.nativeLabel}
                          </Text>
                          <Text style={[styles.listenCardSub, isActive && { color: "rgba(255,255,255,0.8)" }]}>
                            Translated · {preferredLangOption.label}
                          </Text>
                        </View>
                        {!isActive && !isLoading && (
                          <Ionicons name="play-circle" size={32} color={Colors.indigo} />
                        )}
                      </View>
                    </Pressable>
                    {isActive && (
                      <View style={styles.listenCardControls}>
                        <View style={styles.listenCardControlsRow}>
                          <Pressable onPress={handlePauseResume} style={styles.lcBtn} aria-label={isPlaying ? "Pause" : "Resume"}>
                            <Ionicons name={isPlaying ? "pause-circle" : "play-circle"} size={40} color={Colors.white} />
                          </Pressable>
                          <Pressable onPress={handleReplay} style={styles.lcSecBtn}>
                            <Ionicons name="refresh" size={18} color={Colors.white} />
                            <Text style={styles.lcSecBtnText}>Replay</Text>
                          </Pressable>
                          <Pressable onPress={stopAudio} style={styles.lcSecBtn}>
                            <Ionicons name="stop-circle-outline" size={18} color="rgba(255,255,255,0.7)" />
                            <Text style={[styles.lcSecBtnText, { color: "rgba(255,255,255,0.7)" }]}>Stop</Text>
                          </Pressable>
                        </View>
                        {!demoSpeaking && (
                          <View style={styles.speedRow}>
                            <Text style={styles.speedLabel}>Speed</Text>
                            {SPEED_OPTIONS.map((s) => (
                              <Pressable key={s} onPress={() => handleSpeedChange(s)}
                                style={[styles.speedChipLight, speed === s && styles.speedChipLightActive]} hitSlop={8}>
                                <Text style={[styles.speedChipLightText, speed === s && styles.speedChipLightTextActive]}>{s}x</Text>
                              </Pressable>
                            ))}
                          </View>
                        )}
                      </View>
                    )}
                  </View>
                );
              })()}

              {/* Option 3 — Hindi · green (only when preferred ≠ Hindi) */}
              {preferredLang !== "hi" && (() => {
                const mk = "hindi";
                const isActive = activeReadMode === mk && isAudioActive;
                const isLoading = ttsLoading === mk;
                const isPlaying = isActive && (audioState === "playing" || demoSpeaking);
                const otherLoading = ttsLoading !== null && !isLoading;
                return (
                  <View style={[styles.listenCard, styles.listenCardBorderGreen, isActive && styles.listenCardActiveGreen]}>
                    <Pressable
                      onPress={isActive ? undefined : handleReadHindi}
                      disabled={otherLoading || isLoading}
                      style={({ pressed }) => [{ opacity: pressed && !isActive ? 0.8 : 1 }]}
                      testID="listen-hindi-button"
                    >
                      <View style={styles.listenCardRow}>
                        <View style={[styles.listenCardIcon, styles.listenCardIconHindi, isActive && styles.listenCardIconActiveGreen]}>
                          {isLoading
                            ? <ActivityIndicator size="small" color={isActive ? Colors.white : Colors.green} />
                            : <Ionicons name="volume-medium" size={20} color={isActive ? Colors.white : Colors.green} />}
                        </View>
                        <View style={styles.listenCardText}>
                          <Text style={[styles.listenCardTitle, { color: isActive ? Colors.white : Colors.green }]}>
                            {isLoading ? "Translating & preparing..." : "हिंदी"}
                          </Text>
                          <Text style={[styles.listenCardSub, isActive && { color: "rgba(255,255,255,0.8)" }]}>
                            Translated · Hindi
                          </Text>
                        </View>
                        {!isActive && !isLoading && (
                          <Ionicons name="play-circle" size={32} color={Colors.green} />
                        )}
                      </View>
                    </Pressable>
                    {isActive && (
                      <View style={styles.listenCardControls}>
                        <View style={styles.listenCardControlsRow}>
                          <Pressable onPress={handlePauseResume} style={styles.lcBtn} aria-label={isPlaying ? "Pause" : "Resume"}>
                            <Ionicons name={isPlaying ? "pause-circle" : "play-circle"} size={40} color={Colors.white} />
                          </Pressable>
                          <Pressable onPress={handleReplay} style={styles.lcSecBtn}>
                            <Ionicons name="refresh" size={18} color={Colors.white} />
                            <Text style={styles.lcSecBtnText}>Replay</Text>
                          </Pressable>
                          <Pressable onPress={stopAudio} style={styles.lcSecBtn}>
                            <Ionicons name="stop-circle-outline" size={18} color="rgba(255,255,255,0.7)" />
                            <Text style={[styles.lcSecBtnText, { color: "rgba(255,255,255,0.7)" }]}>Stop</Text>
                          </Pressable>
                        </View>
                        {!demoSpeaking && (
                          <View style={styles.speedRow}>
                            <Text style={styles.speedLabel}>Speed</Text>
                            {SPEED_OPTIONS.map((s) => (
                              <Pressable key={s} onPress={() => handleSpeedChange(s)}
                                style={[styles.speedChipLight, speed === s && styles.speedChipLightActive]} hitSlop={8}>
                                <Text style={[styles.speedChipLightText, speed === s && styles.speedChipLightTextActive]}>{s}x</Text>
                              </Pressable>
                            ))}
                          </View>
                        )}
                      </View>
                    )}
                  </View>
                );
              })()}
            </View>

            <View style={styles.savedRow}>
              <Ionicons name="checkmark-circle" size={16} color={Colors.success} />
              <Text style={styles.savedText}>Saved to history</Text>
            </View>

            <Pressable
              onPress={handleScanAnother}
              style={({ pressed }) => [styles.scanAnotherButton, pressed && { opacity: 0.75 }]}
              aria-label="Scan another document"
            >
              <Ionicons name="camera-outline" size={20} color={Colors.saffron} />
              <Text style={styles.scanAnotherText}>Scan Another</Text>
            </Pressable>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  headerBar: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingBottom: 12,
    backgroundColor: Colors.surface,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.border,
  },
  headerIconBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: {
    flex: 1,
    fontSize: 20,
    fontFamily: "Inter_700Bold",
    color: Colors.text,
    textAlign: "center",
    letterSpacing: -0.3,
  },
  langPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: Colors.saffronLight,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 50,
    borderWidth: 1,
    borderColor: Colors.saffronMuted,
    maxWidth: 120,
  },
  langPillText: {
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
    color: Colors.saffron,
    flexShrink: 1,
  },
  demoBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#E3F2FD",
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  demoBannerText: {
    fontSize: 12,
    color: Colors.blue,
    fontFamily: "Inter_400Regular",
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 120,
  },
  idleContainer: {
    alignItems: "center",
    gap: 0,
  },
  tagline: {
    fontSize: 15,
    fontFamily: "Inter_400Regular",
    color: Colors.saffron,
    marginBottom: 28,
    textAlign: "center",
  },
  scanButtonWrapper: {
    marginBottom: 16,
  },
  scanButton: {
    width: 150,
    height: 150,
    borderRadius: 75,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: Colors.saffron,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.35,
    shadowRadius: 16,
    elevation: 8,
  },
  scanLabel: {
    fontSize: 20,
    fontFamily: "Inter_600SemiBold",
    color: Colors.text,
    marginBottom: 10,
  },
  galleryLink: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 10,
    paddingHorizontal: 16,
    marginBottom: 36,
  },
  galleryLinkText: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    color: Colors.textSecondary,
  },
  helpCards: {
    flexDirection: "row",
    gap: 10,
    width: "100%",
  },
  helpCard: {
    flex: 1,
    backgroundColor: Colors.surface,
    borderRadius: 16,
    padding: 14,
    alignItems: "center",
    gap: 8,
    borderWidth: 1,
    borderColor: Colors.border,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 1,
  },
  helpIconCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: Colors.saffronLight,
    alignItems: "center",
    justifyContent: "center",
  },
  helpCardTitle: {
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
    color: Colors.text,
  },
  helpCardDesc: {
    fontSize: 11,
    fontFamily: "Inter_400Regular",
    color: Colors.textSecondary,
    textAlign: "center",
  },
  loadingContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingTop: 60,
  },
  loadingCard: {
    backgroundColor: Colors.surface,
    borderRadius: 24,
    padding: 40,
    alignItems: "center",
    gap: 16,
    borderWidth: 1,
    borderColor: Colors.border,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.06,
    shadowRadius: 12,
    elevation: 3,
  },
  loadingText: {
    fontSize: 18,
    fontFamily: "Inter_600SemiBold",
    color: Colors.text,
  },
  loadingSubtext: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    color: Colors.textSecondary,
  },
  errorContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingTop: 60,
  },
  errorCard: {
    backgroundColor: Colors.surface,
    borderRadius: 24,
    padding: 32,
    alignItems: "center",
    gap: 14,
    width: "100%",
    borderWidth: 1,
    borderColor: Colors.errorLight,
  },
  errorTitle: {
    fontSize: 20,
    fontFamily: "Inter_700Bold",
    color: Colors.text,
    textAlign: "center",
  },
  errorMessage: {
    fontSize: 15,
    fontFamily: "Inter_400Regular",
    color: Colors.textSecondary,
    textAlign: "center",
    lineHeight: 22,
  },
  retryButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: Colors.saffron,
    paddingVertical: 14,
    paddingHorizontal: 28,
    borderRadius: 50,
    marginTop: 4,
  },
  retryButtonText: {
    fontSize: 16,
    fontFamily: "Inter_600SemiBold",
    color: Colors.white,
  },
  resultContainer: {
    gap: 16,
  },
  resultMeta: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  langBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: Colors.saffronLight,
    paddingVertical: 4,
    paddingHorizontal: 12,
    borderRadius: 50,
    borderWidth: 1,
    borderColor: Colors.saffronMuted,
  },
  langBadgeText: {
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
    color: Colors.saffronDark,
  },
  readTimeBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  readTimeText: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    color: Colors.textSecondary,
  },
  textBlock: {
    backgroundColor: Colors.surface,
    borderRadius: 20,
    padding: 18,
    borderWidth: 1,
    borderColor: Colors.border,
    gap: 10,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 2,
  },
  textBlockLabel: {
    fontSize: 12,
    fontFamily: "Inter_600SemiBold",
    color: Colors.textMuted,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  textScroll: {
    maxHeight: 180,
  },
  extractedText: {
    fontSize: 16,
    fontFamily: "Inter_400Regular",
    color: Colors.text,
    lineHeight: 26,
  },
  translationBlock: {
    borderRadius: 20,
    padding: 18,
    borderWidth: 1.5,
    gap: 10,
  },
  translationHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    flexWrap: "wrap",
  },
  translationLabel: {
    fontSize: 15,
    fontFamily: "Inter_700Bold",
  },
  translationLabelSub: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    color: Colors.textSecondary,
    flex: 1,
  },
  translationPlaceholder: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    fontStyle: "italic",
    paddingVertical: 4,
  },
  listenPanel: {
    gap: 10,
  },
  listenSectionLabel: {
    fontSize: 12,
    fontFamily: "Inter_600SemiBold",
    color: Colors.textMuted,
    textTransform: "uppercase",
    letterSpacing: 0.6,
    marginBottom: 2,
  },
  listenCard: {
    backgroundColor: Colors.surface,
    borderRadius: 18,
    borderWidth: 1.5,
    borderColor: Colors.border,
    overflow: "hidden",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 2,
  },
  listenCardBorderOrange: {
    borderColor: Colors.saffronMuted,
  },
  listenCardBorderIndigo: {
    borderColor: Colors.indigoMuted,
  },
  listenCardBorderGreen: {
    borderColor: "#A5D6A7",
  },
  listenCardActiveOrange: {
    backgroundColor: Colors.saffron,
    borderColor: Colors.saffronDark,
  },
  listenCardActiveIndigo: {
    backgroundColor: Colors.indigo,
    borderColor: Colors.indigoDark,
  },
  listenCardActiveGreen: {
    backgroundColor: Colors.green,
    borderColor: "#0a6600",
  },
  listenCardRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    paddingVertical: 16,
    paddingHorizontal: 16,
  },
  listenCardIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  listenCardIconOrange: {
    backgroundColor: Colors.saffronLight,
  },
  listenCardIconActiveOrange: {
    backgroundColor: "rgba(255,255,255,0.25)",
  },
  listenCardIconPref: {
    backgroundColor: Colors.indigoLight,
  },
  listenCardIconActiveIndigo: {
    backgroundColor: "rgba(255,255,255,0.25)",
  },
  listenCardIconHindi: {
    backgroundColor: Colors.greenLight,
  },
  listenCardIconActiveGreen: {
    backgroundColor: "rgba(255,255,255,0.25)",
  },
  listenCardText: {
    flex: 1,
    gap: 3,
  },
  listenCardTitle: {
    fontSize: 16,
    fontFamily: "Inter_600SemiBold",
    color: Colors.text,
  },
  listenCardSub: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    color: Colors.textSecondary,
    lineHeight: 16,
  },
  listenCardControls: {
    paddingHorizontal: 16,
    paddingBottom: 16,
    gap: 12,
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.2)",
    marginTop: 0,
  },
  listenCardControlsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingTop: 12,
  },
  lcBtn: {
    alignItems: "center",
    justifyContent: "center",
  },
  lcSecBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 50,
    backgroundColor: "rgba(255,255,255,0.2)",
  },
  lcSecBtnText: {
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
    color: Colors.white,
  },
  speedRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    flexWrap: "wrap",
  },
  speedLabel: {
    fontSize: 12,
    fontFamily: "Inter_500Medium",
    color: "rgba(255,255,255,0.7)",
    marginRight: 2,
  },
  speedChipLight: {
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: 50,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.3)",
    backgroundColor: "rgba(255,255,255,0.15)",
    minWidth: 44,
    alignItems: "center",
  },
  speedChipLightActive: {
    backgroundColor: "rgba(255,255,255,0.9)",
    borderColor: Colors.white,
  },
  speedChipLightText: {
    fontSize: 12,
    fontFamily: "Inter_500Medium",
    color: "rgba(255,255,255,0.85)",
  },
  speedChipLightTextActive: {
    color: Colors.saffron,
    fontFamily: "Inter_700Bold",
  },
  savedRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    justifyContent: "center",
  },
  savedText: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    color: Colors.success,
  },
  scanAnotherButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    paddingVertical: 18,
    paddingHorizontal: 24,
    borderRadius: 16,
    borderWidth: 2,
    borderColor: Colors.saffron,
    backgroundColor: Colors.saffronLight,
  },
  scanAnotherText: {
    fontSize: 17,
    fontFamily: "Inter_600SemiBold",
    color: Colors.saffron,
  },
});
