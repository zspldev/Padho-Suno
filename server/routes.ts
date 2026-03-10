import type { Express } from "express";
import { createServer, type Server } from "node:http";
import multer from "multer";
import { createScan, getAllScans, getScanById, deleteScan } from "./storage";

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
  hi: { languageCode: "hi-IN", name: "hi-IN-Standard-A" },
  mr: { languageCode: "mr-IN", name: "mr-IN-Standard-A" },
  gu: { languageCode: "gu-IN", name: "gu-IN-Standard-A" },
  en: { languageCode: "en-IN", name: "en-IN-Standard-A" },
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

      const apiKey = process.env.GOOGLE_CLOUD_API_KEY;

      if (!apiKey) {
        return res.json({ ttsAudioBase64: null, demoMode: true });
      }

      const voice = VOICE_MAPPING[language] || VOICE_MAPPING["hi"];

      const ttsRes = await fetch(
        `https://texttospeech.googleapis.com/v1/text:synthesize?key=${apiKey}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            input: { text },
            voice: {
              languageCode: voice.languageCode,
              name: voice.name,
            },
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
      res.json({ ttsAudioBase64: ttsData.audioContent, demoMode: false });
    } catch (err: any) {
      console.error("TTS error:", err);
      res.status(500).json({ message: err.message || "TTS failed" });
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
