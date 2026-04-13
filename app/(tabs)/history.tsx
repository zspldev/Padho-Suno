import React, { useState, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  FlatList,
  ActivityIndicator,
  Alert,
  Platform,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import * as Haptics from "expo-haptics";
import * as Speech from "expo-speech";
import Colors from "@/constants/colors";
import { apiRequest } from "@/lib/query-client";
import { useAudio } from "@/hooks/useAudio";
import { useLanguage } from "@/context/LanguageContext";

interface Scan {
  id: number;
  extractedText: string;
  detectedLanguage: string;
  createdAt: number;
}

const LANGUAGE_LABELS: Record<string, string> = {
  hi: "Hindi",
  mr: "Marathi",
  gu: "Gujarati",
  en: "English",
};

const LANG_FLAG: Record<string, string> = {
  hi: "🇮🇳",
  mr: "🇮🇳",
  gu: "🇮🇳",
  en: "🇬🇧",
};

function formatDate(ts: number): string {
  const date = new Date(ts * 1000);
  const now = new Date();
  const isToday = date.toDateString() === now.toDateString();
  const time = date.toLocaleTimeString("en-IN", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });
  if (isToday) return `Today, ${time}`;
  return (
    date.toLocaleDateString("en-IN", {
      day: "numeric",
      month: "short",
    }) +
    ", " +
    time
  );
}

export default function HistoryScreen() {
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const [playingId, setPlayingId] = useState<number | null>(null);
  const [ttsLoadingId, setTtsLoadingId] = useState<number | null>(null);
  const [demoSpeakingId, setDemoSpeakingId] = useState<number | null>(null);

  const { audioState, playBase64Audio, reset } = useAudio();
  const { preferredLang } = useLanguage();

  const { data: scans, isLoading, error, refetch } = useQuery<Scan[]>({
    queryKey: ["/api/scans"],
  });

  const topInset = Platform.OS === "web" ? 67 : insets.top;
  const bottomInset = Platform.OS === "web" ? 34 : insets.bottom;

  const handlePlay = useCallback(
    async (scan: Scan) => {
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

      if (playingId === scan.id && audioState === "playing") {
        reset();
        setPlayingId(null);
        setDemoSpeakingId(null);
        if (Platform.OS !== "web") {
          Speech.stop();
        } else {
          window.speechSynthesis?.cancel();
        }
        return;
      }

      reset();
      setPlayingId(scan.id);
      setTtsLoadingId(scan.id);

      try {
        let textToRead = scan.extractedText;
        let langToRead = scan.detectedLanguage;

        if (scan.detectedLanguage !== preferredLang) {
          try {
            const tRes = await apiRequest("POST", "/api/translate", {
              text: scan.extractedText,
              sourceLanguage: scan.detectedLanguage,
              targetLanguage: preferredLang,
            });
            const tData = (await tRes.json()) as { translatedText: string; skipped: boolean };
            if (!tData.skipped) {
              textToRead = tData.translatedText;
              langToRead = preferredLang;
            }
          } catch {
          }
        }

        const res = await apiRequest("POST", "/api/tts", {
          text: textToRead,
          language: langToRead,
        });
        const data = (await res.json()) as {
          ttsAudioBase64: string | null;
          audioUrl?: string;
          demoMode: boolean;
        };

        setTtsLoadingId(null);

        if (data.ttsAudioBase64 && data.audioUrl) {
          await playBase64Audio(data.ttsAudioBase64, data.audioUrl, 1);
        } else {
          setDemoSpeakingId(scan.id);
          if (Platform.OS === "web") {
            const utterance = new SpeechSynthesisUtterance(textToRead);
            utterance.lang = langToRead === "en" ? "en-IN" : "hi-IN";
            utterance.rate = 0.85;
            utterance.onend = () => {
              setDemoSpeakingId(null);
              setPlayingId(null);
            };
            window.speechSynthesis.speak(utterance);
          } else {
            Speech.speak(textToRead, {
              language: langToRead === "en" ? "en-IN" : "hi-IN",
              rate: 0.85,
              onDone: () => {
                setDemoSpeakingId(null);
                setPlayingId(null);
              },
              onError: () => {
                setDemoSpeakingId(null);
                setPlayingId(null);
              },
            });
          }
        }
      } catch (err: any) {
        setTtsLoadingId(null);
        setPlayingId(null);
        Alert.alert("Error", err.message || "Could not load audio");
      }
    },
    [playingId, audioState, reset, playBase64Audio, preferredLang]
  );

  const handleDelete = useCallback(
    async (scan: Scan) => {
      Alert.alert("Delete Scan", "Remove this scan from history?", [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
            try {
              if (playingId === scan.id) {
                reset();
                setPlayingId(null);
                if (Platform.OS !== "web") Speech.stop();
                else window.speechSynthesis?.cancel();
              }
              await apiRequest("DELETE", `/api/scans/${scan.id}`);
              queryClient.invalidateQueries({ queryKey: ["/api/scans"] });
              await Haptics.notificationAsync(
                Haptics.NotificationFeedbackType.Success
              );
            } catch (err: any) {
              Alert.alert("Error", err.message || "Could not delete scan");
            }
          },
        },
      ]);
    },
    [playingId, reset, queryClient]
  );

  const renderScan = useCallback(
    ({ item }: { item: Scan }) => {
      const isActive = playingId === item.id;
      const isLoading = ttsLoadingId === item.id;
      const isPlaying =
        isActive &&
        (audioState === "playing" || demoSpeakingId === item.id);

      return (
        <View
          style={[styles.card, isActive && styles.cardActive]}
          testID={`history-card-${item.id}`}
        >
          <View style={styles.cardHeader}>
            <View style={styles.langBadge}>
              <Text style={styles.langBadgeFlag}>
                {LANG_FLAG[item.detectedLanguage] || "🌐"}
              </Text>
              <Text style={styles.langBadgeText}>
                {LANGUAGE_LABELS[item.detectedLanguage] || "Unknown"}
              </Text>
            </View>
            <Text style={styles.dateText}>{formatDate(item.createdAt)}</Text>
          </View>

          <Text style={styles.previewText} numberOfLines={3}>
            {item.extractedText}
          </Text>

          <View style={styles.cardFooter}>
            <Pressable
              onPress={() => handlePlay(item)}
              disabled={isLoading}
              style={({ pressed }) => [
                styles.playButton,
                isActive && styles.playButtonActive,
                pressed && { opacity: 0.8 },
              ]}
              aria-label={isPlaying ? "Stop reading" : "Read aloud"}
              testID={`play-button-${item.id}`}
            >
              {isLoading ? (
                <ActivityIndicator size="small" color={Colors.white} />
              ) : (
                <Ionicons
                  name={isPlaying ? "pause" : "volume-high"}
                  size={18}
                  color={Colors.white}
                />
              )}
              <Text style={styles.playButtonText}>
                {isLoading
                  ? "Loading..."
                  : isPlaying
                  ? "Pause"
                  : "Read Aloud"}
              </Text>
            </Pressable>

            <Pressable
              onPress={() => handleDelete(item)}
              style={({ pressed }) => [
                styles.deleteButton,
                pressed && { opacity: 0.7 },
              ]}
              aria-label="Delete scan"
              hitSlop={8}
            >
              <Ionicons
                name="trash-outline"
                size={20}
                color={Colors.textMuted}
              />
            </Pressable>
          </View>
        </View>
      );
    },
    [playingId, ttsLoadingId, audioState, demoSpeakingId, handlePlay, handleDelete]
  );

  if (isLoading) {
    return (
      <View
        style={[
          styles.centerContainer,
          { paddingTop: topInset + 80 },
        ]}
      >
        <ActivityIndicator size="large" color={Colors.saffron} />
        <Text style={styles.loadingText}>Loading history...</Text>
      </View>
    );
  }

  if (error) {
    return (
      <View
        style={[
          styles.centerContainer,
          { paddingTop: topInset + 80 },
        ]}
      >
        <Ionicons name="alert-circle-outline" size={48} color={Colors.error} />
        <Text style={styles.emptyTitle}>Could not load history</Text>
        <Pressable onPress={() => refetch()} style={styles.retryBtn}>
          <Text style={styles.retryBtnText}>Retry</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={[styles.container]}>
      <View
        style={[
          styles.headerBar,
          { paddingTop: topInset + 12 },
        ]}
      >
        <Text style={styles.headerTitle}>History</Text>
        {scans && scans.length > 0 && (
          <View style={styles.countBadge}>
            <Text style={styles.countBadgeText}>{scans.length}</Text>
          </View>
        )}
      </View>

      <FlatList
        data={scans || []}
        keyExtractor={(item) => item.id.toString()}
        renderItem={renderScan}
        contentContainerStyle={[
          styles.listContent,
          { paddingBottom: bottomInset + 100 },
        ]}
        showsVerticalScrollIndicator={false}
        scrollEnabled={!!(scans && scans.length > 0)}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <View style={styles.emptyIconCircle}>
              <Ionicons
                name="document-text-outline"
                size={48}
                color={Colors.saffron}
              />
            </View>
            <Text style={styles.emptyTitle}>No scans yet</Text>
            <Text style={styles.emptySubtitle}>
              Tap Scan to read your first document
            </Text>
          </View>
        }
        contentInsetAdjustmentBehavior="automatic"
      />
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
    paddingHorizontal: 20,
    paddingBottom: 16,
    backgroundColor: Colors.background,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    gap: 10,
  },
  headerTitle: {
    fontSize: 28,
    fontFamily: "Inter_700Bold",
    color: Colors.text,
  },
  countBadge: {
    backgroundColor: Colors.saffron,
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 3,
    minWidth: 28,
    alignItems: "center",
  },
  countBadgeText: {
    fontSize: 13,
    fontFamily: "Inter_700Bold",
    color: Colors.white,
  },
  listContent: {
    padding: 16,
    gap: 12,
  },
  card: {
    backgroundColor: Colors.surface,
    borderRadius: 20,
    padding: 18,
    gap: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 2,
  },
  cardActive: {
    borderColor: Colors.saffronMuted,
    backgroundColor: Colors.saffronLight,
  },
  cardHeader: {
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
    paddingHorizontal: 10,
    borderRadius: 50,
    borderWidth: 1,
    borderColor: Colors.saffronMuted,
  },
  langBadgeFlag: {
    fontSize: 14,
  },
  langBadgeText: {
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
    color: Colors.saffronDark,
  },
  dateText: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    color: Colors.textMuted,
  },
  previewText: {
    fontSize: 16,
    fontFamily: "Inter_400Regular",
    color: Colors.text,
    lineHeight: 24,
  },
  cardFooter: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  playButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: Colors.saffron,
    paddingVertical: 13,
    paddingHorizontal: 16,
    borderRadius: 50,
    minHeight: 48,
  },
  playButtonActive: {
    backgroundColor: Colors.saffronDark,
  },
  playButtonText: {
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
    color: Colors.white,
  },
  deleteButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Colors.borderLight,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  centerContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "flex-start",
    gap: 12,
    paddingHorizontal: 32,
    backgroundColor: Colors.background,
  },
  loadingText: {
    fontSize: 16,
    fontFamily: "Inter_400Regular",
    color: Colors.textSecondary,
    marginTop: 8,
  },
  emptyContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingTop: 80,
    gap: 16,
  },
  emptyIconCircle: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: Colors.saffronLight,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 8,
  },
  emptyTitle: {
    fontSize: 20,
    fontFamily: "Inter_600SemiBold",
    color: Colors.text,
  },
  emptySubtitle: {
    fontSize: 15,
    fontFamily: "Inter_400Regular",
    color: Colors.textSecondary,
    textAlign: "center",
  },
  retryBtn: {
    paddingVertical: 12,
    paddingHorizontal: 28,
    backgroundColor: Colors.saffron,
    borderRadius: 50,
    marginTop: 8,
  },
  retryBtnText: {
    fontSize: 16,
    fontFamily: "Inter_600SemiBold",
    color: Colors.white,
  },
});
