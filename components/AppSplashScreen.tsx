import React, { useEffect, useRef } from "react";
import { Animated, StyleSheet, View, Text, Image } from "react-native";

interface Props {
  onFinished: () => void;
}

export default function AppSplashScreen({ onFinished }: Props) {
  const opacity  = useRef(new Animated.Value(0)).current;
  const scale    = useRef(new Animated.Value(0.88)).current;
  const titleOp  = useRef(new Animated.Value(0)).current;
  const screenOp = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    // Fade + scale icon in
    Animated.parallel([
      Animated.timing(opacity, { toValue: 1, duration: 400, useNativeDriver: false }),
      Animated.spring(scale,   { toValue: 1, tension: 55, friction: 8, useNativeDriver: false }),
    ]).start(() => {
      // Fade title in shortly after
      Animated.timing(titleOp, { toValue: 1, duration: 320, delay: 60, useNativeDriver: false }).start();
    });

    // After 2200ms start fade-out, then call onFinished
    const exit = setTimeout(() => {
      Animated.timing(screenOp, { toValue: 0, duration: 350, useNativeDriver: false }).start(
        () => onFinished(),
      );
    }, 2200);

    return () => clearTimeout(exit);
  }, []);

  return (
    <Animated.View style={[styles.container, { opacity: screenOp }]}>
      <Animated.View style={{ opacity, transform: [{ scale }] }}>
        <Image
          source={require("@/assets/images/splash-icon.png")}
          style={styles.icon}
          resizeMode="contain"
        />
      </Animated.View>

      <Animated.View style={[styles.textWrap, { opacity: titleOp }]}>
        <Text style={styles.appName}>PadhoSuno</Text>
        <Text style={styles.appNameNative}>पढ़ो सुनो</Text>
        <Text style={styles.tagline}>Scan · Translate · Listen</Text>
      </Animated.View>

      <View style={styles.footer}>
        <Text style={styles.footerText}>Powered by Sarvam AI</Text>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "#FF9933",
    alignItems: "center",
    justifyContent: "center",
  },
  icon: {
    width: 160,
    height: 160,
    marginBottom: 32,
  },
  textWrap: {
    alignItems: "center",
    gap: 6,
  },
  appName: {
    fontSize: 34,
    fontFamily: "Inter_700Bold",
    color: "#FFFFFF",
    letterSpacing: -0.5,
  },
  appNameNative: {
    fontSize: 20,
    fontFamily: "Inter_400Regular",
    color: "rgba(255,255,255,0.85)",
    letterSpacing: 0.5,
  },
  tagline: {
    marginTop: 8,
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    color: "rgba(255,255,255,0.65)",
    letterSpacing: 1.2,
    textTransform: "uppercase",
  },
  footer: {
    position: "absolute",
    bottom: 48,
    left: 0,
    right: 0,
    alignItems: "center",
  },
  footerText: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    color: "rgba(255,255,255,0.55)",
    letterSpacing: 0.3,
  },
});
