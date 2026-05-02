import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  FlatList,
  Modal,
  Platform,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import Colors from "@/constants/colors";
import { LANG_OPTIONS, type LangCode } from "@/context/LanguageContext";

interface Props {
  visible: boolean;
  isFirstLaunch?: boolean;
  currentLang?: LangCode;
  onSelect: (lang: LangCode) => void;
  onDismiss?: () => void;
}

export default function LanguagePickerModal({
  visible,
  isFirstLaunch = false,
  currentLang,
  onSelect,
  onDismiss,
}: Props) {
  const insets = useSafeAreaInsets();
  const topInset = Platform.OS === "web" ? 67 : insets.top;
  const bottomInset = Platform.OS === "web" ? 34 : insets.bottom;
  const [selected, setSelected] = useState<LangCode | null>(currentLang ?? null);

  useEffect(() => {
    if (visible) {
      setSelected(currentLang ?? null);
    }
  }, [visible, currentLang]);

  const handlePick = async (code: LangCode) => {
    setSelected(code);
    await Haptics.selectionAsync();
  };

  const handleConfirm = async () => {
    if (!selected) return;
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    onSelect(selected);
    if (!isFirstLaunch) onDismiss?.();
  };

  const handleDismiss = async () => {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onDismiss?.();
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="fullScreen">
      <View style={[styles.container, { paddingTop: topInset }]}>
        <View style={styles.topBar}>
          {!isFirstLaunch && (
            <Pressable onPress={handleDismiss} style={styles.closeBtn} hitSlop={12}>
              <Ionicons name="close" size={24} color={Colors.text} />
            </Pressable>
          )}
          <View style={{ flex: 1 }} />
        </View>

        <View style={styles.titleBlock}>
          <View style={styles.iconCircle}>
            <Ionicons name="language" size={32} color={Colors.saffron} />
          </View>
          <Text style={styles.title}>
            {isFirstLaunch ? "Choose Your Language" : "Change Language"}
          </Text>
          <Text style={styles.subtitle}>
            {isFirstLaunch
              ? "Select the language you'd like documents read in"
              : "Pick your preferred listening language"}
          </Text>
        </View>

        <FlatList
          data={LANG_OPTIONS}
          keyExtractor={(item) => item.code}
          numColumns={2}
          columnWrapperStyle={styles.row}
          contentContainerStyle={[
            styles.listContent,
            { paddingBottom: bottomInset + 100 },
          ]}
          showsVerticalScrollIndicator={false}
          renderItem={({ item }) => {
            const isSelected = selected === item.code;
            return (
              <Pressable
                onPress={() => handlePick(item.code)}
                style={({ pressed }) => [
                  styles.langCard,
                  isSelected && styles.langCardSelected,
                  pressed && { opacity: 0.8 },
                ]}
                testID={`lang-option-${item.code}`}
              >
                {isSelected && (
                  <View style={styles.checkBadge}>
                    <Ionicons name="checkmark" size={12} color={Colors.white} />
                  </View>
                )}
                <Text style={[styles.nativeLabel, isSelected && styles.nativeLabelSelected]}>
                  {item.nativeLabel}
                </Text>
                <Text style={[styles.langLabel, isSelected && styles.langLabelSelected]}>
                  {item.label}
                </Text>
              </Pressable>
            );
          }}
        />

        <View style={[styles.footer, { paddingBottom: bottomInset + 16 }]}>
          <Pressable
            onPress={handleConfirm}
            disabled={!selected}
            style={({ pressed }) => [
              styles.confirmButton,
              !selected && styles.confirmButtonDisabled,
              pressed && selected && { opacity: 0.85 },
            ]}
            testID="confirm-language-button"
          >
            <Ionicons name="checkmark-circle" size={22} color={Colors.white} />
            <Text style={styles.confirmButtonText}>
              {selected
                ? `Continue in ${LANG_OPTIONS.find((o) => o.code === selected)?.label}`
                : "Select a language to continue"}
            </Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingBottom: 4,
    minHeight: 44,
  },
  closeBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Colors.borderLight,
  },
  titleBlock: {
    alignItems: "center",
    paddingHorizontal: 24,
    paddingBottom: 20,
    gap: 10,
  },
  iconCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: Colors.saffronLight,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 4,
  },
  title: {
    fontSize: 26,
    fontFamily: "Inter_700Bold",
    color: Colors.text,
    textAlign: "center",
  },
  subtitle: {
    fontSize: 15,
    fontFamily: "Inter_400Regular",
    color: Colors.textSecondary,
    textAlign: "center",
    lineHeight: 22,
  },
  listContent: {
    paddingHorizontal: 16,
    gap: 10,
  },
  row: {
    gap: 10,
    marginBottom: 10,
  },
  langCard: {
    flex: 1,
    backgroundColor: Colors.surface,
    borderRadius: 16,
    paddingVertical: 18,
    paddingHorizontal: 14,
    borderWidth: 2,
    borderColor: Colors.border,
    alignItems: "center",
    gap: 4,
    position: "relative",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 1,
  },
  langCardSelected: {
    borderColor: Colors.saffron,
    backgroundColor: Colors.saffronLight,
  },
  checkBadge: {
    position: "absolute",
    top: 8,
    right: 8,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: Colors.saffron,
    alignItems: "center",
    justifyContent: "center",
  },
  nativeLabel: {
    fontSize: 20,
    fontFamily: "Inter_700Bold",
    color: Colors.text,
    textAlign: "center",
  },
  nativeLabelSelected: {
    color: Colors.saffronDark,
  },
  langLabel: {
    fontSize: 12,
    fontFamily: "Inter_500Medium",
    color: Colors.textMuted,
    textAlign: "center",
  },
  langLabelSelected: {
    color: Colors.saffron,
  },
  footer: {
    paddingHorizontal: 20,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    backgroundColor: Colors.background,
  },
  confirmButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    backgroundColor: Colors.saffron,
    paddingVertical: 18,
    borderRadius: 16,
  },
  confirmButtonDisabled: {
    backgroundColor: Colors.textMuted,
  },
  confirmButtonText: {
    fontSize: 16,
    fontFamily: "Inter_600SemiBold",
    color: Colors.white,
  },
});
