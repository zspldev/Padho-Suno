import type { Express } from "express";
import { createServer, type Server } from "node:http";
import { randomUUID } from "node:crypto";
import multer from "multer";
import { createScan, getAllScans, getScanById, deleteScan } from "./storage";

const ttsAudioCache = new Map<string, { buffer: Buffer; contentType: string }>();
function cacheTtsAudio(buffer: Buffer, contentType: string): string {
  const id = randomUUID();
  ttsAudioCache.set(id, { buffer, contentType });
  setTimeout(() => ttsAudioCache.delete(id), 15 * 60 * 1000);
  return id;
}

// Sarvam AI — language codes (BCP-47) and speaker voices (22 official Indian languages)
const SARVAM_LANG_CODE: Record<string, string> = {
  as:  "as-IN",
  bn:  "bn-IN",
  brx: "brx-IN",
  doi: "doi-IN",
  en:  "en-IN",
  gu:  "gu-IN",
  hi:  "hi-IN",
  kn:  "kn-IN",
  ks:  "ks-IN",
  kok: "kok-IN",
  mai: "mai-IN",
  ml:  "ml-IN",
  mni: "mni-IN",
  mr:  "mr-IN",
  ne:  "ne-IN",
  or:  "or-IN",
  pa:  "pa-IN",
  sa:  "sa-IN",
  sd:  "sd-IN",
  ta:  "ta-IN",
  te:  "te-IN",
  ur:  "ur-IN",
};

const SARVAM_SPEAKER: Record<string, string> = {
  as:  "meera",
  bn:  "meera",
  brx: "meera",
  doi: "meera",
  en:  "ishita",
  gu:  "ritu",
  hi:  "ritu",
  kn:  "meera",
  ks:  "meera",
  kok: "meera",
  mai: "meera",
  ml:  "meera",
  mni: "meera",
  mr:  "ritu",
  ne:  "meera",
  or:  "meera",
  pa:  "meera",
  sa:  "ritu",
  sd:  "meera",
  ta:  "meera",
  te:  "meera",
  ur:  "meera",
};

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype.startsWith("image/")) {
      cb(null, true);
    } else {
      cb(new Error("Only image files are allowed"));
    }
  },
});

const LANGUAGE_LABELS: Record<string, string> = {
  hi: "Hindi",
  mr: "Marathi",
  gu: "Gujarati",
  en: "English",
};

const VOICE_MAPPING: Record<string, { languageCode: string; name: string }> = {
  hi: { languageCode: "hi-IN", name: "hi-IN-Wavenet-D" },
  mr: { languageCode: "mr-IN", name: "mr-IN-Wavenet-A" },
  gu: { languageCode: "gu-IN", name: "gu-IN-Wavenet-A" },
  en: { languageCode: "en-IN", name: "en-IN-Wavenet-D" },
};

const SUPPORTED_LANGS = ["hi", "mr", "gu", "en"];

const MOCK_HINDI_TEXT = `आपकी दवाई की जानकारी

दवाई का नाम: पैरासिटामॉल 500mg
खुराक: एक गोली सुबह और एक गोली शाम को
भोजन के साथ लेना है

सावधानियाँ:
• यह दवाई बच्चों की पहुंच से दूर रखें
• डॉक्टर की सलाह के बिना न लें
• ठंडी और सूखी जगह पर रखें

निर्माता: फार्मा इंडिया लिमिटेड
समाप्ति तिथि: 12/2026
बैच नं: B2024-789`;

function normalizeLanguage(langCode: string): string | null {
  if (SUPPORTED_LANGS.includes(langCode)) return langCode;
  const prefix = langCode.split("-")[0];
  if (SUPPORTED_LANGS.includes(prefix)) return prefix;
  return null;
}

export async function registerRoutes(app: Express): Promise<Server> {
  app.post("/api/scan", upload.single("image"), async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ message: "No image file provided" });
      }

      const apiKey = process.env.GOOGLE_CLOUD_API_KEY;
      let extractedText: string;
      let detectedLanguage: string;
      const demoMode = !apiKey;

      if (!apiKey) {
        extractedText = MOCK_HINDI_TEXT;
        detectedLanguage = "hi";
      } else {
        const base64Image = req.file.buffer.toString("base64");

        const visionRes = await fetch(
          `https://vision.googleapis.com/v1/images:annotate?key=${apiKey}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              requests: [
                {
                  image: { content: base64Image },
                  features: [{ type: "DOCUMENT_TEXT_DETECTION" }],
                },
              ],
            }),
          }
        );

        if (!visionRes.ok) {
          const errData = await visionRes.json() as any;
          return res.status(500).json({
            message: `Vision API error: ${errData.error?.message || "Unknown error"}`,
          });
        }

        const visionData = await visionRes.json() as any;
        extractedText =
          visionData.responses[0]?.fullTextAnnotation?.text || "";

        if (!extractedText) {
          return res.status(422).json({
            message:
              "We couldn't read this document. Try better lighting or hold the camera steady.",
          });
        }

        const rawLang =
          visionData.responses[0]?.textAnnotations?.[0]?.locale || "hi";
        const normalized = normalizeLanguage(rawLang);

        if (!normalized) {
          return res.status(422).json({
            message:
              "This language is not yet supported. We currently support Hindi, Marathi, Gujarati, and English.",
          });
        }

        detectedLanguage = normalized;
      }

      const scan = createScan({ extractedText, detectedLanguage });
      const languageLabel = LANGUAGE_LABELS[detectedLanguage] || "Unknown";

      res.json({
        id: scan.id,
        extractedText,
        detectedLanguage,
        languageLabel,
        demoMode,
      });
    } catch (err: any) {
      console.error("Scan error:", err);
      if (err.code === "LIMIT_FILE_SIZE") {
        return res
          .status(400)
          .json({ message: "Image too large. Please use a smaller photo." });
      }
      res.status(500).json({ message: err.message || "Scan failed" });
    }
  });

  app.post("/api/tts", async (req, res) => {
    try {
      const { text, language } = req.body as {
        text: string;
        language: string;
      };

      if (!text || !language) {
        return res.status(400).json({ message: "text and language are required" });
      }

      const sarvamKey = process.env.SARVAM_API_KEY;
      const googleKey = process.env.GOOGLE_CLOUD_API_KEY;

      if (!sarvamKey && !googleKey) {
        return res.json({ ttsAudioBase64: null, demoMode: true });
      }

      let audioBase64: string;
      let contentType: string;

      if (sarvamKey) {
        // ── Sarvam Bulbul v3 ──
        const langCode = SARVAM_LANG_CODE[language] || "hi-IN";
        const speaker = SARVAM_SPEAKER[language] || "ritu";

        const sarvamRes = await fetch("https://api.sarvam.ai/text-to-speech", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "api-subscription-key": sarvamKey,
          },
          body: JSON.stringify({
            text,
            target_language_code: langCode,
            speaker,
            model: "bulbul:v3",
            pace: 1.0,
          }),
        });

        if (!sarvamRes.ok) {
          const errData = await sarvamRes.json() as any;
          const errMsg = errData?.message || errData?.detail || "Unknown error";
          console.error("Sarvam TTS error:", errMsg);
          return res.status(500).json({ message: `Sarvam TTS error: ${errMsg}` });
        }

        const sarvamData = await sarvamRes.json() as any;
        audioBase64 = sarvamData.audios?.[0];
        contentType = "audio/wav";

        if (!audioBase64) {
          return res.status(500).json({ message: "Sarvam TTS returned no audio" });
        }
      } else {
        // ── Google WaveNet fallback ──
        const voice = VOICE_MAPPING[language] || VOICE_MAPPING["hi"];

        const ttsRes = await fetch(
          `https://texttospeech.googleapis.com/v1/text:synthesize?key=${googleKey}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              input: { text },
              voice: { languageCode: voice.languageCode, name: voice.name },
              audioConfig: { audioEncoding: "MP3" },
            }),
          }
        );

        if (!ttsRes.ok) {
          const errData = await ttsRes.json() as any;
          return res.status(500).json({
            message: `TTS API error: ${errData.error?.message || "Unknown error"}`,
          });
        }

        const ttsData = await ttsRes.json() as any;
        audioBase64 = ttsData.audioContent;
        contentType = "audio/mpeg";
      }

      const audioBuffer = Buffer.from(audioBase64, "base64");
      const audioId = cacheTtsAudio(audioBuffer, contentType);
      res.json({
        ttsAudioBase64: audioBase64,
        audioUrl: `/api/tts-audio/${audioId}`,
        audioFormat: contentType === "audio/wav" ? "wav" : "mp3",
        demoMode: false,
      });
    } catch (err: any) {
      console.error("TTS error:", err);
      res.status(500).json({ message: err.message || "TTS failed" });
    }
  });

  app.get("/api/tts-audio/:id", (req, res) => {
    const entry = ttsAudioCache.get(req.params.id);
    if (!entry) {
      return res.status(404).json({ message: "Audio not found or expired" });
    }
    res.setHeader("Content-Type", entry.contentType);
    res.setHeader("Content-Length", entry.buffer.length);
    res.setHeader("Cache-Control", "private, max-age=900");
    res.send(entry.buffer);
  });

  app.post("/api/translate", async (req, res) => {
    try {
      const { text, sourceLanguage, targetLanguage } = req.body as {
        text: string;
        sourceLanguage: string;
        targetLanguage: string;
      };

      if (!text || !sourceLanguage || !targetLanguage) {
        return res.status(400).json({ message: "text, sourceLanguage and targetLanguage are required" });
      }

      if (sourceLanguage === targetLanguage) {
        return res.json({ translatedText: text, skipped: true });
      }

      const sarvamKey = process.env.SARVAM_API_KEY;
      const googleKey = process.env.GOOGLE_CLOUD_API_KEY;

      if (!sarvamKey && !googleKey) {
        return res.json({ translatedText: text, skipped: true, demoMode: true });
      }

      if (sarvamKey) {
        // ── Sarvam Translate v1 ──
        const sourceLangCode = SARVAM_LANG_CODE[sourceLanguage] || `${sourceLanguage}-IN`;
        const targetLangCode = SARVAM_LANG_CODE[targetLanguage] || `${targetLanguage}-IN`;

        const sarvamRes = await fetch("https://api.sarvam.ai/translate", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "api-subscription-key": sarvamKey,
          },
          body: JSON.stringify({
            input: text,
            source_language_code: sourceLangCode,
            target_language_code: targetLangCode,
            model: "sarvam-translate:v1",
          }),
        });

        if (!sarvamRes.ok) {
          const errData = await sarvamRes.json() as any;
          const errMsg = errData?.message || errData?.detail || "Unknown error";
          console.error("Sarvam Translation error:", errMsg);
          return res.json({ translatedText: text, skipped: true, apiError: errMsg });
        }

        const sarvamData = await sarvamRes.json() as any;
        const translatedText = sarvamData.translated_text || text;
        return res.json({ translatedText, skipped: false });
      }

      // ── Google Translate fallback ──
      const translateRes = await fetch(
        `https://translation.googleapis.com/language/translate/v2?key=${googleKey}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            q: text,
            source: sourceLanguage,
            target: targetLanguage,
            format: "text",
          }),
        }
      );

      if (!translateRes.ok) {
        const errData = await translateRes.json() as any;
        const errMsg: string = errData.error?.message || "Unknown error";
        console.error("Translation API error:", errMsg);
        return res.json({ translatedText: text, skipped: true, apiError: errMsg });
      }

      const translateData = await translateRes.json() as any;
      const translatedText = translateData.data?.translations?.[0]?.translatedText || text;

      res.json({ translatedText, skipped: false });
    } catch (err: any) {
      console.error("Translation error:", err);
      res.status(500).json({ message: err.message || "Translation failed" });
    }
  });

  app.get("/api/scans", (_req, res) => {
    try {
      const allScans = getAllScans();
      res.json(allScans);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/scans/:id", (req, res) => {
    try {
      const id = parseInt(req.params.id, 10);
      if (isNaN(id)) {
        return res.status(400).json({ message: "Invalid scan ID" });
      }
      const scan = getScanById(id);
      if (!scan) {
        return res.status(404).json({ message: "Scan not found" });
      }
      res.json(scan);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.delete("/api/scans/:id", (req, res) => {
    try {
      const id = parseInt(req.params.id, 10);
      if (isNaN(id)) {
        return res.status(400).json({ message: "Invalid scan ID" });
      }
      deleteScan(id);
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}
