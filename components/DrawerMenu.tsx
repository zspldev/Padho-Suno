import React, { useRef, useEffect, useState, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Modal,
  Animated,
  Share,
  Linking,
  ScrollView,
  Dimensions,
  Platform,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import Constants from "expo-constants";
import Colors from "@/constants/colors";
import { usePreferences, TEXT_SIZE_OPTIONS, SPEED_OPTIONS_PREF, TextSizeKey } from "@/context/PreferencesContext";
import menuData from "@/burger-menu.json";

const { width: SCREEN_WIDTH } = Dimensions.get("window");
const DRAWER_WIDTH = Math.min(SCREEN_WIDTH * 0.82, 340);

type ActionKey = string;

interface MenuItem {
  key: string;
  label: string;
  icon: string;
  action: ActionKey;
  url?: string;
}

interface MenuGroup {
  key: string;
  label: string;
  items: MenuItem[];
}

interface Props {
  visible: boolean;
  onClose: () => void;
  onOpenLanguage: () => void;
}

const APP_VERSION = Constants.expoConfig?.version ?? "1.0.0";
const nd = Platform.OS !== "web";

export default function DrawerMenu({ visible, onClose, onOpenLanguage }: Props) {
  const insets = useSafeAreaInsets();
  const slideAnim = useRef(new Animated.Value(-DRAWER_WIDTH)).current;
  const fadeAnim  = useRef(new Animated.Value(0)).current;
  const [mounted, setMounted] = useState(false);
  const [activeModal, setActiveModal] = useState<"about" | "how_to_use" | null>(null);
  const [expandedKey, setExpandedKey] = useState<string | null>(null);

  const { textSize, setTextSize, defaultSpeed, setDefaultSpeed } = usePreferences();

  useEffect(() => {
    if (visible) {
      setMounted(true);
      slideAnim.setValue(-DRAWER_WIDTH);
      fadeAnim.setValue(0);
      Animated.parallel([
        Animated.timing(slideAnim, { toValue: 0,   duration: 270, useNativeDriver: nd }),
        Animated.timing(fadeAnim,  { toValue: 1,   duration: 270, useNativeDriver: nd }),
      ]).start();
    } else if (mounted) {
      Animated.parallel([
        Animated.timing(slideAnim, { toValue: -DRAWER_WIDTH, duration: 220, useNativeDriver: nd }),
        Animated.timing(fadeAnim,  { toValue: 0,             duration: 220, useNativeDriver: nd }),
      ]).start(() => setMounted(false));
    }
  }, [visible]);

  const handleAction = useCallback((item: MenuItem) => {
    switch (item.action) {
      case "language":
        onClose();
        setTimeout(onOpenLanguage, 280);
        break;
      case "reading_speed":
        setExpandedKey((k) => (k === "reading_speed" ? null : "reading_speed"));
        break;
      case "text_size":
        setExpandedKey((k) => (k === "text_size" ? null : "text_size"));
        break;
      case "how_to_use":
        setActiveModal("how_to_use");
        break;
      case "about":
        setActiveModal("about");
        break;
      case "share":
        Share.share({
          message: "PadhoSuno — Scan any document and hear it in your language. पढ़ो सुनो!\nhttps://padhosuno.app",
          title: "PadhoSuno",
        });
        break;
      case "rate":
        Linking.openURL("https://apps.apple.com/app/padhosuno/id000000000");
        break;
      case "feedback":
        Linking.openURL("mailto:feedback@padhosuno.app?subject=PadhoSuno Feedback");
        break;
      case "external":
        if (item.url) Linking.openURL(item.url);
        break;
    }
  }, [onClose, onOpenLanguage]);

  const groups: MenuGroup[] = (menuData as any).groups;

  if (!mounted) return null;

  return (
    <View style={styles.root} pointerEvents="box-none">
      {/* Backdrop */}
      <Animated.View style={[styles.backdrop, { opacity: fadeAnim }]} pointerEvents="auto">
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} testID="drawer-backdrop" />
      </Animated.View>

      {/* Drawer panel */}
      <Animated.View
        style={[styles.drawer, { paddingTop: insets.top, transform: [{ translateX: slideAnim }] }]}
      >
        {/* Header */}
        <View style={styles.drawerHeader}>
          <View style={styles.appIconCircle}>
            <Ionicons name="book" size={24} color={Colors.white} />
          </View>
          <View style={styles.appTitleBlock}>
            <Text style={styles.appName}>PadhoSuno</Text>
            <Text style={styles.appNameNative}>पढ़ो सुनो</Text>
          </View>
          <Pressable onPress={onClose} style={styles.closeBtn} hitSlop={12}>
            <Ionicons name="close" size={22} color={Colors.white} />
          </Pressable>
        </View>

        {/* Menu items */}
        <ScrollView
          style={styles.menuScroll}
          contentContainerStyle={[styles.menuContent, { paddingBottom: insets.bottom + 16 }]}
          showsVerticalScrollIndicator={false}
        >
          {groups.map((group, gi) => (
            <View key={group.key} style={[styles.group, gi > 0 && styles.groupSpacing]}>
              <Text style={styles.groupLabel}>{group.label}</Text>
              {group.items.map((item) => (
                <View key={item.key}>
                  <Pressable
                    onPress={() => handleAction(item)}
                    style={({ pressed }) => [styles.menuItem, pressed && styles.menuItemPressed]}
                    testID={`drawer-item-${item.key}`}
                  >
                    <View style={styles.menuItemIcon}>
                      <Ionicons name={item.icon as any} size={20} color={Colors.saffron} />
                    </View>
                    <Text style={styles.menuItemLabel}>{item.label}</Text>

                    {item.action === "text_size" && (
                      <Text style={styles.menuItemBadge}>
                        {TEXT_SIZE_OPTIONS.find((o) => o.key === textSize)?.label}
                      </Text>
                    )}
                    {item.action === "reading_speed" && (
                      <Text style={styles.menuItemBadge}>{defaultSpeed}×</Text>
                    )}

                    <Ionicons
                      name={
                        (item.action === "reading_speed" || item.action === "text_size")
                          ? expandedKey === item.action ? "chevron-up" : "chevron-down"
                          : item.action === "external" || item.action === "rate" || item.action === "feedback"
                          ? "open-outline"
                          : "chevron-forward"
                      }
                      size={15}
                      color={Colors.textMuted}
                    />
                  </Pressable>

                  {item.action === "reading_speed" && expandedKey === "reading_speed" && (
                    <View style={styles.inlinePicker}>
                      {SPEED_OPTIONS_PREF.map((s) => (
                        <Pressable
                          key={s}
                          onPress={() => setDefaultSpeed(s)}
                          style={[styles.chip, defaultSpeed === s && styles.chipActive]}
                        >
                          <Text style={[styles.chipText, defaultSpeed === s && styles.chipTextActive]}>
                            {s}×
                          </Text>
                        </Pressable>
                      ))}
                    </View>
                  )}

                  {item.action === "text_size" && expandedKey === "text_size" && (
                    <View style={styles.inlinePicker}>
                      {TEXT_SIZE_OPTIONS.map((o) => (
                        <Pressable
                          key={o.key}
                          onPress={() => setTextSize(o.key as TextSizeKey)}
                          style={[styles.chip, styles.chipWide, textSize === o.key && styles.chipActive]}
                        >
                          <Text style={[styles.chipText, textSize === o.key && styles.chipTextActive]}>
                            {o.label}
                          </Text>
                        </Pressable>
                      ))}
                    </View>
                  )}
                </View>
              ))}
            </View>
          ))}

          <View style={styles.footer}>
            <Text style={styles.footerText}>Version {APP_VERSION}</Text>
            <Text style={styles.footerText}>Powered by Sarvam AI · Google Vision</Text>
          </View>
        </ScrollView>
      </Animated.View>

      {/* About modal */}
      <Modal visible={activeModal === "about"} transparent animationType="fade" onRequestClose={() => setActiveModal(null)}>
        <View style={styles.infoModalOverlay}>
          <View style={[styles.infoModal, { paddingBottom: insets.bottom + 20 }]}>
            <View style={styles.infoModalHeader}>
              <Text style={styles.infoModalTitle}>About PadhoSuno</Text>
              <Pressable onPress={() => setActiveModal(null)} hitSlop={12}>
                <Ionicons name="close-circle" size={26} color={Colors.textMuted} />
              </Pressable>
            </View>

            <View style={styles.aboutIconRow}>
              <View style={styles.aboutIconCircle}>
                <Ionicons name="book" size={36} color={Colors.white} />
              </View>
            </View>

            <Text style={styles.aboutAppName}>PadhoSuno</Text>
            <Text style={styles.aboutNative}>पढ़ो सुनो</Text>
            <Text style={styles.aboutTagline}>Scan · Translate · Listen</Text>

            <View style={styles.aboutRow}>
              <Text style={styles.aboutLabel}>Version</Text>
              <Text style={styles.aboutValue}>{APP_VERSION}</Text>
            </View>
            <View style={styles.aboutDivider} />
            <View style={styles.aboutRow}>
              <Text style={styles.aboutLabel}>OCR Engine</Text>
              <Text style={styles.aboutValue}>Google Cloud Vision</Text>
            </View>
            <View style={styles.aboutDivider} />
            <View style={styles.aboutRow}>
              <Text style={styles.aboutLabel}>Translation & TTS</Text>
              <Text style={styles.aboutValue}>Sarvam AI — Bulbul v3</Text>
            </View>
            <View style={styles.aboutDivider} />
            <View style={styles.aboutRow}>
              <Text style={styles.aboutLabel}>Languages</Text>
              <Text style={styles.aboutValue}>22 Indian languages</Text>
            </View>
            <View style={styles.aboutDivider} />
            <View style={styles.aboutRow}>
              <Text style={styles.aboutLabel}>Built for</Text>
              <Text style={styles.aboutValue}>Visually impaired & low-literacy users in India</Text>
            </View>

            <Pressable style={styles.aboutCloseBtn} onPress={() => setActiveModal(null)}>
              <Text style={styles.aboutCloseBtnText}>Close</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      {/* How to Use modal */}
      <Modal visible={activeModal === "how_to_use"} transparent animationType="fade" onRequestClose={() => setActiveModal(null)}>
        <View style={styles.infoModalOverlay}>
          <View style={[styles.infoModal, { paddingBottom: insets.bottom + 20 }]}>
            <View style={styles.infoModalHeader}>
              <Text style={styles.infoModalTitle}>How to Use</Text>
              <Pressable onPress={() => setActiveModal(null)} hitSlop={12}>
                <Ionicons name="close-circle" size={26} color={Colors.textMuted} />
              </Pressable>
            </View>

            {[
              {
                step: "1",
                icon: "camera-outline" as const,
                color: Colors.saffron,
                bg: Colors.saffronLight,
                title: "Scan the Document",
                desc: "Tap the big orange button and take a photo of any printed document — prescription, letter, notice, or form.",
              },
              {
                step: "2",
                icon: "language-outline" as const,
                color: Colors.indigo,
                bg: Colors.indigoLight,
                title: "Text is Extracted",
                desc: "The app reads the text from your photo using AI and shows it on screen, no matter which Indian language it is in.",
              },
              {
                step: "3",
                icon: "volume-high-outline" as const,
                color: Colors.green,
                bg: Colors.greenLight,
                title: "Listen in Your Language",
                desc: "Tap any card at the bottom — hear the document in the original language, your preferred language, or Hindi.",
              },
              {
                step: "4",
                icon: "language-outline" as const,
                color: Colors.saffron,
                bg: Colors.saffronLight,
                title: "Change Language",
                desc: "Tap the language pill (top-right) or open this menu → Language to switch your preferred reading language at any time.",
              },
            ].map((s) => (
              <View key={s.step} style={styles.howToStep}>
                <View style={[styles.howToIconCircle, { backgroundColor: s.bg }]}>
                  <Ionicons name={s.icon} size={22} color={s.color} />
                </View>
                <View style={styles.howToText}>
                  <Text style={styles.howToTitle}>{s.title}</Text>
                  <Text style={styles.howToDesc}>{s.desc}</Text>
                </View>
              </View>
            ))}

            <Pressable style={styles.aboutCloseBtn} onPress={() => setActiveModal(null)}>
              <Text style={styles.aboutCloseBtnText}>Got it</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 999,
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.45)",
  },
  drawer: {
    position: "absolute",
    top: 0,
    left: 0,
    bottom: 0,
    width: DRAWER_WIDTH,
    backgroundColor: Colors.surface,
    shadowColor: "#000",
    shadowOffset: { width: 6, height: 0 },
    shadowOpacity: 0.18,
    shadowRadius: 20,
    elevation: 16,
  },
  drawerHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: Colors.saffron,
    paddingHorizontal: 16,
    paddingVertical: 18,
  },
  appIconCircle: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: "rgba(255,255,255,0.25)",
    alignItems: "center",
    justifyContent: "center",
  },
  appTitleBlock: {
    flex: 1,
  },
  appName: {
    fontSize: 18,
    fontFamily: "Inter_700Bold",
    color: Colors.white,
    letterSpacing: -0.3,
  },
  appNameNative: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    color: "rgba(255,255,255,0.8)",
  },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "rgba(255,255,255,0.2)",
    alignItems: "center",
    justifyContent: "center",
  },
  menuScroll: {
    flex: 1,
  },
  menuContent: {
    paddingTop: 12,
    paddingHorizontal: 12,
    gap: 4,
  },
  group: {
    gap: 2,
  },
  groupSpacing: {
    marginTop: 16,
    paddingTop: 16,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Colors.border,
  },
  groupLabel: {
    fontSize: 11,
    fontFamily: "Inter_600SemiBold",
    color: Colors.textMuted,
    textTransform: "uppercase",
    letterSpacing: 0.7,
    paddingHorizontal: 8,
    paddingBottom: 6,
  },
  menuItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 8,
    borderRadius: 12,
  },
  menuItemPressed: {
    backgroundColor: Colors.saffronLight,
  },
  menuItemIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: Colors.saffronLight,
    alignItems: "center",
    justifyContent: "center",
  },
  menuItemLabel: {
    flex: 1,
    fontSize: 15,
    fontFamily: "Inter_500Medium",
    color: Colors.text,
  },
  menuItemBadge: {
    fontSize: 13,
    fontFamily: "Inter_500Medium",
    color: Colors.saffron,
    marginRight: 2,
  },
  inlinePicker: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    paddingHorizontal: 8,
    paddingTop: 4,
    paddingBottom: 12,
  },
  chip: {
    paddingVertical: 7,
    paddingHorizontal: 14,
    borderRadius: 50,
    borderWidth: 1.5,
    borderColor: Colors.border,
    backgroundColor: Colors.borderLight,
  },
  chipWide: {
    paddingHorizontal: 18,
  },
  chipActive: {
    backgroundColor: Colors.saffron,
    borderColor: Colors.saffronDark,
  },
  chipText: {
    fontSize: 13,
    fontFamily: "Inter_500Medium",
    color: Colors.textSecondary,
  },
  chipTextActive: {
    color: Colors.white,
    fontFamily: "Inter_700Bold",
  },
  footer: {
    marginTop: 20,
    paddingTop: 16,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Colors.border,
    gap: 4,
    paddingHorizontal: 8,
  },
  footerText: {
    fontSize: 11,
    fontFamily: "Inter_400Regular",
    color: Colors.textMuted,
  },

  infoModalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.55)",
    justifyContent: "flex-end",
  },
  infoModal: {
    backgroundColor: Colors.surface,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: 24,
    paddingTop: 20,
    gap: 0,
    maxHeight: "90%",
  },
  infoModalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 20,
  },
  infoModalTitle: {
    fontSize: 18,
    fontFamily: "Inter_700Bold",
    color: Colors.text,
  },

  aboutIconRow: {
    alignItems: "center",
    marginBottom: 12,
  },
  aboutIconCircle: {
    width: 76,
    height: 76,
    borderRadius: 38,
    backgroundColor: Colors.saffron,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: Colors.saffron,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 12,
    elevation: 6,
  },
  aboutAppName: {
    fontSize: 22,
    fontFamily: "Inter_700Bold",
    color: Colors.text,
    textAlign: "center",
  },
  aboutNative: {
    fontSize: 15,
    fontFamily: "Inter_400Regular",
    color: Colors.saffron,
    textAlign: "center",
    marginBottom: 4,
  },
  aboutTagline: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    color: Colors.textSecondary,
    textAlign: "center",
    marginBottom: 20,
    letterSpacing: 0.5,
  },
  aboutRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    paddingVertical: 12,
    gap: 12,
  },
  aboutLabel: {
    fontSize: 13,
    fontFamily: "Inter_500Medium",
    color: Colors.textSecondary,
    flexShrink: 0,
  },
  aboutValue: {
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
    color: Colors.text,
    textAlign: "right",
    flex: 1,
  },
  aboutDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: Colors.border,
  },
  aboutCloseBtn: {
    marginTop: 20,
    backgroundColor: Colors.saffron,
    borderRadius: 50,
    paddingVertical: 14,
    alignItems: "center",
  },
  aboutCloseBtnText: {
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
    color: Colors.white,
  },

  howToStep: {
    flexDirection: "row",
    gap: 14,
    marginBottom: 18,
    alignItems: "flex-start",
  },
  howToIconCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  howToText: {
    flex: 1,
    gap: 3,
  },
  howToTitle: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
    color: Colors.text,
  },
  howToDesc: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    color: Colors.textSecondary,
    lineHeight: 19,
  },
});
