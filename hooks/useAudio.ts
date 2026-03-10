import { useRef, useState, useCallback, useEffect } from "react";
import { Platform } from "react-native";
import * as FileSystem from "expo-file-system";
import { Audio } from "expo-av";

export type AudioState = "idle" | "loading" | "playing" | "paused" | "error";

export const SPEED_OPTIONS = [0.75, 1, 1.25, 1.5, 2];

export function useAudio() {
  const [audioState, setAudioState] = useState<AudioState>("idle");
  const [speed, setSpeedVal] = useState(1);

  const soundRef = useRef<Audio.Sound | null>(null);
  const webAudioRef = useRef<HTMLAudioElement | null>(null);
  const currentBase64Ref = useRef<string | null>(null);

  const cleanupNative = useCallback(async () => {
    if (soundRef.current) {
      try {
        await soundRef.current.stopAsync();
        await soundRef.current.unloadAsync();
      } catch {}
      soundRef.current = null;
    }
  }, []);

  const cleanupWeb = useCallback(() => {
    if (webAudioRef.current) {
      webAudioRef.current.pause();
      webAudioRef.current.src = "";
      webAudioRef.current = null;
    }
  }, []);

  const cleanup = useCallback(async () => {
    if (Platform.OS === "web") {
      cleanupWeb();
    } else {
      await cleanupNative();
    }
  }, [cleanupNative, cleanupWeb]);

  useEffect(() => {
    return () => {
      cleanup();
    };
  }, [cleanup]);

  const playBase64Audio = useCallback(
    async (base64: string, speedValue: number = 1) => {
      await cleanup();
      currentBase64Ref.current = base64;
      setAudioState("loading");

      try {
        if (Platform.OS === "web") {
          const audio = new (window as any).Audio(
            `data:audio/mp3;base64,${base64}`
          );
          audio.playbackRate = speedValue;
          webAudioRef.current = audio;

          audio.addEventListener("ended", () => setAudioState("idle"));
          audio.addEventListener("error", () => setAudioState("error"));

          await audio.play();
          setAudioState("playing");
        } else {
          const fileUri = `${FileSystem.cacheDirectory}padho_tts.mp3`;
          await FileSystem.writeAsStringAsync(fileUri, base64, {
            encoding: FileSystem.EncodingType.Base64,
          });

          const { sound } = await Audio.Sound.createAsync({ uri: fileUri });
          soundRef.current = sound;

          await sound.setRateAsync(speedValue, true);

          sound.setOnPlaybackStatusUpdate((status) => {
            if (status.isLoaded && status.didJustFinish) {
              setAudioState("idle");
            }
          });

          await sound.playAsync();
          setAudioState("playing");
        }
      } catch (e) {
        console.error("Audio playback error:", e);
        setAudioState("error");
      }
    },
    [cleanup]
  );

  const pause = useCallback(async () => {
    try {
      if (Platform.OS === "web" && webAudioRef.current) {
        webAudioRef.current.pause();
        setAudioState("paused");
      } else if (soundRef.current) {
        await soundRef.current.pauseAsync();
        setAudioState("paused");
      }
    } catch (e) {
      console.error("Pause error:", e);
    }
  }, []);

  const resume = useCallback(async () => {
    try {
      if (Platform.OS === "web" && webAudioRef.current) {
        await webAudioRef.current.play();
        setAudioState("playing");
      } else if (soundRef.current) {
        await soundRef.current.playAsync();
        setAudioState("playing");
      }
    } catch (e) {
      console.error("Resume error:", e);
    }
  }, []);

  const replay = useCallback(async () => {
    if (currentBase64Ref.current) {
      await playBase64Audio(currentBase64Ref.current, speed);
    }
  }, [playBase64Audio, speed]);

  const setSpeed = useCallback(
    async (newSpeed: number) => {
      setSpeedVal(newSpeed);
      try {
        if (Platform.OS === "web" && webAudioRef.current) {
          webAudioRef.current.playbackRate = newSpeed;
        } else if (soundRef.current) {
          await soundRef.current.setRateAsync(newSpeed, true);
        }
      } catch (e) {
        console.error("Set speed error:", e);
      }
    },
    []
  );

  const reset = useCallback(async () => {
    await cleanup();
    currentBase64Ref.current = null;
    setAudioState("idle");
    setSpeedVal(1);
  }, [cleanup]);

  return {
    audioState,
    speed,
    playBase64Audio,
    pause,
    resume,
    replay,
    setSpeed,
    reset,
    cleanup,
  };
}
