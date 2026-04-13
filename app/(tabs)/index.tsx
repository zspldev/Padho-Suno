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
import { useAudio, SPEED_OPTIONS, type AudioState } from "@/hooks/useAudio";
import { useLanguage, LANG_OPTIONS } from "@/context/LanguageContext";

type ScanState = "idle" | "loading" | "result" | "error";

interface ScanResult {
  id: number;
  extractedText: string;
  detectedLanguage: string;
  languageLabel: string;
  demoMode: boolean;
}

const LANG_FLAG: Record<string, string> = {
  hi: "🇮🇳",
  mr: "🇮🇳",
  gu: "🇮🇳",
  en: "🇬🇧",
};

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
  const [ttsLoading, setTtsLoading] = useState(false);
  const [demoSpeaking, setDemoSpeaking] = useState(false);
  const [translatedText, setTranslatedText] = useState<string | null>(null);
  const [translating, setTranslating] = useState(false);
  const scaleAnim = useRef(new Animated.Value(1)).current;

  const { preferredLang, setPreferredLang } = useLanguage();
  const { audioState, speed, playBase64Audio, pause, resume, replay, setSpeed, reset } = useAudio();

  const handlePressIn = () => {
    Animated.spring(scaleAnim, {
      toValue: 0.93,
      useNativeDriver: true,
    }).start();
  };

  const handlePressOut = () => {
    Animated.spring(scaleAnim, {
      toValue: 1,
      useNativeDriver: true,
    }).start();
  };

  const openImagePicker = useCallback(
    async (useCamera: boolean) => {
      try {
        if (useCamera) {
          const { status } =
            await ImagePicker.requestCameraPermissionsAsync();
          if (status !== "granted") {
            Alert.alert(
              "Permission needed",
              "Camera access is required to scan documents."
            );
            return;
          }
        }

        const result = useCamera
          ? await ImagePicker.launchCameraAsync({
              mediaTypes: ["images"],
              quality: 0.8,
              allowsEditing: false,
            })
          : await ImagePicker.launchImageLibraryAsync({
              mediaTypes: ["images"],
              quality: 0.8,
              allowsEditing: false,
            });

        if (result.canceled || !result.assets[0]) return;

        await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        setScanState("loading");
        setErrorMessage("");
        setScanResult(null);
        reset();

        const imageUri = result.assets[0].uri;
        const data = await uploadScanImage(imageUri);

        queryClient.invalidateQueries({ queryKey: ["/api/scans"] });
        setScanResult(data);
        setScanState("result");
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

        if (data.detectedLanguage !== preferredLang) {
          setTranslating(true);
          try {
            const tRes = await apiRequest("POST", "/api/translate", {
              text: data.extractedText,
              sourceLanguage: data.detectedLanguage,
              targetLanguage: preferredLang,
            });
            const tData = (await tRes.json()) as { translatedText: string; skipped: boolean };
            if (!tData.skipped) setTranslatedText(tData.translatedText);
          } catch {
          } finally {
            setTranslating(false);
          }
        }
      } catch (err: any) {
        setScanState("error");
        setErrorMessage(
          err.message?.replace(/^\d+:\s*/, "") ||
            "Something went wrong. Please try again."
        );
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
        {
          text: "Take Photo",
          onPress: () => openImagePicker(true),
        },
        {
          text: "Choose from Gallery",
          onPress: () => openImagePicker(false),
        },
        { text: "Cancel", style: "cancel" },
      ]);
    }
  }, [openImagePicker]);

  const handleReadAloud = useCallback(async () => {
    if (!scanResult) return;
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    const textToRead = translatedText || scanResult.extractedText;
    const langToRead = translatedText ? preferredLang : scanResult.detectedLanguage;

    setTtsLoading(true);
    try {
      const res = await apiRequest("POST", "/api/tts", {
        text: textToRead,
        language: langToRead,
      });
      const data = (await res.json()) as {
        ttsAudioBase64: string | null;
        audioUrl?: string;
        demoMode: boolean;
      };

      if (data.ttsAudioBase64 && data.audioUrl) {
        await playBase64Audio(data.ttsAudioBase64, data.audioUrl, speed);
      } else {
        setDemoSpeaking(true);
        if (Platform.OS === "web") {
          const utterance = new SpeechSynthesisUtterance(textToRead);
          utterance.lang = langToRead === "en" ? "en-IN" : "hi-IN";
          utterance.rate = 0.85;
          utterance.onend = () => setDemoSpeaking(false);
          window.speechSynthesis.speak(utterance);
        } else {
          Speech.speak(textToRead, {
            language: langToRead === "en" ? "en-IN" : "hi-IN",
            rate: 0.85,
            onDone: () => setDemoSpeaking(false),
            onError: () => setDemoSpeaking(false),
          });
        }
      }
    } catch (err: any) {
      setDemoSpeaking(false);
      Alert.alert("Error", err.message || "Could not load audio");
    } finally {
      setTtsLoading(false);
    }
  }, [scanResult, translatedText, preferredLang, playBase64Audio, speed]);

  const handlePauseResume = useCallback(async () => {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (audioState === "playing") {
      await pause();
    } else if (audioState === "paused") {
      await resume();
    }
  }, [audioState, pause, resume]);

  const handleReplay = useCallback(async () => {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (audioState !== "idle" || demoSpeaking) {
      setDemoSpeaking(false);
      if (Platform.OS !== "web") {
        Speech.stop();
      } else {
        window.speechSynthesis?.cancel();
      }
      await replay();
    } else {
      await replay();
    }
  }, [audioState, demoSpeaking, replay]);

  const handleSpeedChange = useCallback(
    async (s: number) => {
      await Haptics.selectionAsync();
      await setSpeed(s);
    },
    [setSpeed]
  );

  const handleScanAnother = useCallback(async () => {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    reset();
    setDemoSpeaking(false);
    if (Platform.OS !== "web") {
      Speech.stop();
    } else if (Platform.OS === "web") {
      window.speechSynthesis?.cancel();
    }
    setScanState("idle");
    setScanResult(null);
    setErrorMessage("");
    setTranslatedText(null);
    setTranslating(false);
  }, [reset]);

  const isAudioActive =
    audioState === "playing" || audioState === "paused" || demoSpeaking;
  const topInset = Platform.OS === "web" ? 67 : insets.top;

  return (
    <View style={styles.container}>
      <View style={[styles.langBar, { paddingTop: topInset + 6 }]}>
        {LANG_OPTIONS.map((opt) => (
          <Pressable
            key={opt.code}
            onPress={() => {
              setPreferredLang(opt.code);
              setTranslatedText(null);
            }}
            style={[
              styles.langBarBtn,
              preferredLang === opt.code && styles.langBarBtnActive,
            ]}
          >
            <Text
              style={[
                styles.langBarBtnText,
                preferredLang === opt.code && styles.langBarBtnTextActive,
              ]}
            >
              {opt.nativeLabel}
            </Text>
          </Pressable>
        ))}
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
        contentContainerStyle={[
          styles.scrollContent,
          { paddingTop: 16 },
        ]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        contentInsetAdjustmentBehavior="automatic"
      >
        <View style={styles.header}>
          <Text style={styles.appName}>PadhoSuno</Text>
          <Text style={styles.tagline}>पढ़ो सुनो — Photo लो, सुनो</Text>
        </View>

        {scanState === "idle" && (
          <View style={styles.idleContainer}>
            <Animated.View style={{ transform: [{ scale: scaleAnim }] }}>
              <Pressable
                onPress={handleScanButton}
                onPressIn={handlePressIn}
                onPressOut={handlePressOut}
                aria-label="Scan document"
                testID="scan-button"
                style={styles.scanButtonWrapper}
              >
                <LinearGradient
                  colors={[Colors.saffron, Colors.saffronDark]}
                  style={styles.scanButton}
                >
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
              <Ionicons
                name="images-outline"
                size={16}
                color={Colors.textSecondary}
              />
              <Text style={styles.galleryLinkText}>Upload from gallery</Text>
            </Pressable>

            <View style={styles.helpCards}>
              {[
                {
                  icon: "camera-outline" as const,
                  title: "Capture",
                  desc: "Point camera at any document",
                },
                {
                  icon: "text-outline" as const,
                  title: "Extract",
                  desc: "AI reads the text for you",
                },
                {
                  icon: "volume-high-outline" as const,
                  title: "Listen",
                  desc: "Hear the document read aloud",
                },
              ].map((item, i) => (
                <View key={i} style={styles.helpCard}>
                  <View style={styles.helpIconCircle}>
                    <Ionicons
                      name={item.icon}
                      size={22}
                      color={Colors.saffron}
                    />
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
              <Text style={styles.loadingSubtext}>
                This may take a moment
              </Text>
            </View>
          </View>
        )}

        {scanState === "error" && (
          <View style={styles.errorContainer} aria-live="polite">
            <View style={styles.errorCard}>
              <Ionicons
                name="alert-circle"
                size={48}
                color={Colors.error}
              />
              <Text style={styles.errorTitle}>Could not read document</Text>
              <Text style={styles.errorMessage}>{errorMessage}</Text>
              <Pressable
                onPress={() => setScanState("idle")}
                style={styles.retryButton}
              >
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
                <Text style={styles.langBadgeFlag}>
                  {LANG_FLAG[scanResult.detectedLanguage] || "🌐"}
                </Text>
                <Text style={styles.langBadgeText}>
                  {scanResult.languageLabel}
                </Text>
              </View>
              <View style={styles.readTimeBadge}>
                <Ionicons
                  name="time-outline"
                  size={14}
                  color={Colors.textSecondary}
                />
                <Text style={styles.readTimeText}>
                  {estimateReadingTime(scanResult.extractedText)}
                </Text>
              </View>
            </View>

            <View style={styles.textBlock}>
              {(translatedText || scanResult.detectedLanguage !== preferredLang) && (
                <Text style={styles.textBlockLabel}>
                  Original — {LANG_OPTIONS.find(o => o.code === scanResult.detectedLanguage)?.label || scanResult.languageLabel}
                </Text>
              )}
              <ScrollView
                nestedScrollEnabled
                showsVerticalScrollIndicator
                style={styles.textScroll}
              >
                <Text style={styles.extractedText} selectable aria-label="Extracted text">
                  {scanResult.extractedText}
                </Text>
              </ScrollView>
            </View>

            {(translating || translatedText) && (
              <View style={styles.translationBlock}>
                <View style={styles.translationHeader}>
                  <Ionicons name="language" size={15} color={Colors.saffron} />
                  <Text style={styles.translationLabel}>
                    Translated to {LANG_OPTIONS.find(o => o.code === preferredLang)?.label}
                  </Text>
                  {translating && <ActivityIndicator size="small" color={Colors.saffron} style={{ marginLeft: 6 }} />}
                </View>
                {translatedText && (
                  <ScrollView nestedScrollEnabled showsVerticalScrollIndicator style={styles.textScroll}>
                    <Text style={styles.extractedText} selectable aria-label="Translated text">
                      {translatedText}
                    </Text>
                  </ScrollView>
                )}
              </View>
            )}

            {!isAudioActive && (
              <Pressable
                onPress={handleReadAloud}
                disabled={ttsLoading}
                style={({ pressed }) => [
                  styles.readAloudButton,
                  pressed && { opacity: 0.85 },
                  ttsLoading && { opacity: 0.7 },
                ]}
                aria-label="Read aloud"
                testID="read-aloud-button"
              >
                <LinearGradient
                  colors={[Colors.saffron, Colors.saffronDark]}
                  style={styles.readAloudGradient}
                >
                  {ttsLoading ? (
                    <ActivityIndicator size="small" color={Colors.white} />
                  ) : (
                    <Ionicons
                      name="volume-high"
                      size={26}
                      color={Colors.white}
                    />
                  )}
                  <Text style={styles.readAloudText}>
                    {ttsLoading ? "Preparing audio..." : "Read Aloud"}
                  </Text>
                </LinearGradient>
              </Pressable>
            )}

            {isAudioActive && (
              <View style={styles.audioControls}>
                <View style={styles.audioMainRow}>
                  <Pressable
                    onPress={handlePauseResume}
                    style={styles.audioControlBtn}
                    aria-label={
                      audioState === "playing" ? "Pause" : "Resume"
                    }
                  >
                    <LinearGradient
                      colors={[Colors.saffron, Colors.saffronDark]}
                      style={styles.audioControlBtnGradient}
                    >
                      <Ionicons
                        name={
                          audioState === "playing" || demoSpeaking
                            ? "pause"
                            : "play"
                        }
                        size={28}
                        color={Colors.white}
                      />
                    </LinearGradient>
                  </Pressable>
                  <Pressable
                    onPress={handleReplay}
                    style={styles.audioReplayBtn}
                    aria-label="Replay from start"
                  >
                    <Ionicons
                      name="refresh"
                      size={22}
                      color={Colors.saffron}
                    />
                    <Text style={styles.audioReplayText}>Replay</Text>
                  </Pressable>
                </View>

                {!demoSpeaking && (
                  <View style={styles.speedRow}>
                    <Ionicons
                      name="speedometer-outline"
                      size={16}
                      color={Colors.textSecondary}
                    />
                    {SPEED_OPTIONS.map((s) => (
                      <Pressable
                        key={s}
                        onPress={() => handleSpeedChange(s)}
                        style={[
                          styles.speedChip,
                          speed === s && styles.speedChipActive,
                        ]}
                        hitSlop={8}
                      >
                        <Text
                          style={[
                            styles.speedChipText,
                            speed === s && styles.speedChipTextActive,
                          ]}
                        >
                          {s}x
                        </Text>
                      </Pressable>
                    ))}
                  </View>
                )}
              </View>
            )}

            <View style={styles.savedRow}>
              <Ionicons
                name="checkmark-circle"
                size={16}
                color={Colors.success}
              />
              <Text style={styles.savedText}>Saved to history</Text>
            </View>

            <Pressable
              onPress={handleScanAnother}
              style={({ pressed }) => [
                styles.scanAnotherButton,
                pressed && { opacity: 0.75 },
              ]}
              aria-label="Scan another document"
            >
              <Ionicons
                name="camera-outline"
                size={20}
                color={Colors.saffron}
              />
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
  langBar: {
    flexDirection: "row",
    backgroundColor: Colors.surface,
    paddingHorizontal: 12,
    paddingBottom: 10,
    gap: 6,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.border,
  },
  langBarBtn: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 8,
    alignItems: "center",
    backgroundColor: "transparent",
  },
  langBarBtnActive: {
    backgroundColor: Colors.saffron,
  },
  langBarBtnText: {
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
    color: Colors.textSecondary,
  },
  langBarBtnTextActive: {
    color: "#fff",
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
    paddingBottom: 120,
  },
  header: {
    alignItems: "center",
    marginBottom: 32,
  },
  appName: {
    fontSize: 34,
    fontFamily: "Inter_700Bold",
    color: Colors.text,
    letterSpacing: -0.5,
  },
  tagline: {
    fontSize: 15,
    fontFamily: "Inter_400Regular",
    color: Colors.saffron,
    marginTop: 6,
    textAlign: "center",
  },
  idleContainer: {
    alignItems: "center",
    gap: 0,
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
    shadowOpacity: 0.4,
    shadowRadius: 16,
    elevation: 12,
  },
  scanLabel: {
    fontSize: 20,
    fontFamily: "Inter_600SemiBold",
    color: Colors.text,
    marginBottom: 12,
  },
  galleryLink: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 16,
    marginBottom: 40,
  },
  galleryLinkText: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    color: Colors.textSecondary,
    textDecorationLine: "underline",
  },
  helpCards: {
    flexDirection: "row",
    gap: 12,
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
    lineHeight: 16,
  },
  loadingContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingTop: 40,
  },
  loadingCard: {
    backgroundColor: Colors.surface,
    borderRadius: 24,
    padding: 40,
    alignItems: "center",
    gap: 16,
    width: "100%",
    borderWidth: 1,
    borderColor: Colors.border,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 3,
  },
  loadingText: {
    fontSize: 18,
    fontFamily: "Inter_600SemiBold",
    color: Colors.text,
    textAlign: "center",
  },
  loadingSubtext: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    color: Colors.textSecondary,
  },
  errorContainer: {
    flex: 1,
    alignItems: "center",
    paddingTop: 40,
  },
  errorCard: {
    backgroundColor: Colors.errorLight,
    borderRadius: 24,
    padding: 32,
    alignItems: "center",
    gap: 12,
    width: "100%",
    borderWidth: 1,
    borderColor: "#FFCDD2",
  },
  errorTitle: {
    fontSize: 18,
    fontFamily: "Inter_600SemiBold",
    color: Colors.error,
    textAlign: "center",
  },
  errorMessage: {
    fontSize: 15,
    fontFamily: "Inter_400Regular",
    color: Colors.error,
    textAlign: "center",
    lineHeight: 22,
  },
  retryButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: Colors.error,
    paddingVertical: 14,
    paddingHorizontal: 28,
    borderRadius: 50,
    marginTop: 8,
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
    gap: 10,
    flexWrap: "wrap",
  },
  langBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: Colors.saffronLight,
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 50,
    borderWidth: 1,
    borderColor: Colors.saffronMuted,
  },
  langBadgeFlag: {
    fontSize: 16,
  },
  langBadgeText: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
    color: Colors.saffronDark,
  },
  readTimeBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: Colors.surface,
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 50,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  readTimeText: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    color: Colors.textSecondary,
  },
  textBlock: {
    backgroundColor: Colors.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.saffronMuted,
    overflow: "hidden",
    marginBottom: 12,
  },
  textBlockLabel: {
    fontSize: 11,
    fontFamily: "Inter_600SemiBold",
    color: Colors.textSecondary,
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 2,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  translationBlock: {
    backgroundColor: Colors.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.saffron,
    overflow: "hidden",
    marginBottom: 12,
  },
  translationHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 2,
  },
  translationLabel: {
    fontSize: 11,
    fontFamily: "Inter_600SemiBold",
    color: Colors.saffron,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    flex: 1,
  },
  textScroll: {
    maxHeight: 220,
    padding: 16,
  },
  extractedText: {
    fontSize: 18,
    fontFamily: "Inter_400Regular",
    color: Colors.text,
    lineHeight: 30,
  },
  readAloudButton: {
    borderRadius: 16,
    overflow: "hidden",
    shadowColor: Colors.saffron,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
  },
  readAloudGradient: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    paddingVertical: 20,
    paddingHorizontal: 24,
  },
  readAloudText: {
    fontSize: 18,
    fontFamily: "Inter_700Bold",
    color: Colors.white,
  },
  audioControls: {
    backgroundColor: Colors.surface,
    borderRadius: 20,
    padding: 20,
    gap: 16,
    borderWidth: 1,
    borderColor: Colors.border,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 3,
  },
  audioMainRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
  },
  audioControlBtn: {
    borderRadius: 36,
    overflow: "hidden",
  },
  audioControlBtnGradient: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: "center",
    justifyContent: "center",
  },
  audioReplayBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 14,
    paddingHorizontal: 20,
    backgroundColor: Colors.saffronLight,
    borderRadius: 50,
    borderWidth: 1,
    borderColor: Colors.saffronMuted,
  },
  audioReplayText: {
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
    color: Colors.saffron,
  },
  speedRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flexWrap: "wrap",
  },
  speedChip: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 50,
    backgroundColor: Colors.borderLight,
    borderWidth: 1,
    borderColor: Colors.border,
    minWidth: 48,
    alignItems: "center",
  },
  speedChipActive: {
    backgroundColor: Colors.saffron,
    borderColor: Colors.saffronDark,
  },
  speedChipText: {
    fontSize: 13,
    fontFamily: "Inter_500Medium",
    color: Colors.textSecondary,
  },
  speedChipTextActive: {
    color: Colors.white,
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
