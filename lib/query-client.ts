import { fetch } from "expo/fetch";
import { Platform } from "react-native";
import { QueryClient, QueryFunction } from "@tanstack/react-query";

export function getApiUrl(): string {
  let host = process.env.EXPO_PUBLIC_DOMAIN;

  if (!host) {
    throw new Error("EXPO_PUBLIC_DOMAIN is not set");
  }

  let url = new URL(`https://${host}`);

  return url.href;
}

async function throwIfResNotOk(res: Response) {
  if (!res.ok) {
    const text = (await res.text()) || res.statusText;
    throw new Error(`${res.status}: ${text}`);
  }
}

export async function apiRequest(
  method: string,
  route: string,
  data?: unknown | undefined
): Promise<Response> {
  const baseUrl = getApiUrl();
  const url = new URL(route, baseUrl);

  const res = await fetch(url.toString(), {
    method,
    headers: data ? { "Content-Type": "application/json" } : {},
    body: data ? JSON.stringify(data) : undefined,
    credentials: "include",
  });

  await throwIfResNotOk(res);
  return res;
}

export async function uploadScanImage(imageUri: string): Promise<{
  id: number;
  extractedText: string;
  detectedLanguage: string;
  languageLabel: string;
  demoMode: boolean;
}> {
  const baseUrl = getApiUrl();
  const url = new URL("/api/scan", baseUrl);

  const formData = new FormData();

  if (Platform.OS === "web") {
    const response = await globalThis.fetch(imageUri);
    const blob = await response.blob();
    formData.append("image", blob, "scan.jpg");
  } else {
    formData.append("image", {
      uri: imageUri,
      type: "image/jpeg",
      name: "scan.jpg",
    } as any);
  }

  // Use globalThis.fetch (not expo/fetch) — expo/fetch's FormData
  // implementation does not support the { uri, type, name } file pattern
  // required for native multipart uploads on iOS/Android.
  const res = await globalThis.fetch(url.toString(), {
    method: "POST",
    body: formData as any,
    credentials: "include",
  });

  if (!res.ok) {
    let message = "Scan failed";
    try {
      const data = await res.json() as any;
      message = data.message || message;
    } catch {}
    throw new Error(message);
  }

  return res.json() as any;
}

type UnauthorizedBehavior = "returnNull" | "throw";
export const getQueryFn: <T>(options: {
  on401: UnauthorizedBehavior;
}) => QueryFunction<T> =
  ({ on401: unauthorizedBehavior }) =>
  async ({ queryKey }) => {
    const baseUrl = getApiUrl();
    const url = new URL(queryKey.join("/") as string, baseUrl);

    const res = await fetch(url.toString(), {
      credentials: "include",
    });

    if (unauthorizedBehavior === "returnNull" && res.status === 401) {
      return null;
    }

    await throwIfResNotOk(res);
    return await res.json();
  };

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      queryFn: getQueryFn({ on401: "throw" }),
      refetchInterval: false,
      refetchOnWindowFocus: false,
      staleTime: Infinity,
      retry: false,
    },
    mutations: {
      retry: false,
    },
  },
});
