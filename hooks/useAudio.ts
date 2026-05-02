import { useRef, useState, useCallback, useEffect } from "react";
import { Platform } from "react-native";
import { Audio } from "expo-av";
import { getApiUrl } from "@/lib/query-client";

export type AudioState = "idle" | "loading" | "playing" | "paused" | "error";

export const SPEED_OPTIONS = [0.75, 1, 1.25, 1.5, 2];

export function useAudio() {
  const [audioState, setAudioState] = useState<AudioState>("idle");
  const [speed, setSpeedVal] = useState(1);

  const soundRef = useRef<Audio.Sound | null>(null);
  const webAudioRef = useRef<HTMLAudioElement | null>(null);
  const currentAudioRef = useRef<{ base64: string; nativeUrl: string; format?: string } | null>(null);

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

  const playAudio = useCallback(
    async (
      audioInfo: { base64: string; nativeUrl: string; format?: string },
      speedValue: number = 1
    ) => {
      await cleanup();
      currentAudioRef.current = audioInfo;
      setAudioState("loading");

      try {
        if (Platform.OS === "web") {
          const mimeType = audioInfo.format === "wav" ? "audio/wav" : "audio/mp3";
          const audio = new (window as any).Audio(
            `data:${mimeType};base64,${audioInfo.base64}`
          );
          audio.playbackRate = speedValue;
          webAudioRef.current = audio;

          audio.addEventListener("ended", () => setAudioState("idle"));
          audio.addEventListener("error", () => setAudioState("error"));

          await audio.play();
          setAudioState("playing");
        } else {
          const baseUrl = getApiUrl().replace(/\/$/, "");
          const fullUrl = `${baseUrl}${audioInfo.nativeUrl}`;

          await Audio.setAudioModeAsync({ playsInSilentModeIOS: true });

          const { sound } = await Audio.Sound.createAsync({ uri: fullUrl });
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

  const playBase64Audio = useCallback(
    async (base64: string, nativeUrl: string, speedValue: number = 1, audioFormat?: string) => {
      await playAudio({ base64, nativeUrl, format: audioFormat }, speedValue);
    },
    [playAudio]
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
    if (currentAudioRef.current) {
      await playAudio(currentAudioRef.current, speed);
    }
  }, [playAudio, speed]);

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
    currentAudioRef.current = null;
    setAudioState("idle");
    setSpeedVal(1);
  }, [cleanup]);

  return {
    audioState,
    speed,
    playAudio,
    playBase64Audio,
    pause,
    resume,
    replay,
    setSpeed,
    reset,
    cleanup,
  };
}
