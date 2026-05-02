# PadhoSuno — Project Documentation

> **"पढो सुनो"** — Read. Listen.
> A mobile-first app for visually impaired and low-literacy users in India.

---

## Table of Contents

1. [Project Overview](#1-project-overview)
2. [Target Users](#2-target-users)
3. [Core Features](#3-core-features)
4. [Tech Stack](#4-tech-stack)
5. [Architecture](#5-architecture)
6. [File Structure](#6-file-structure)
7. [API Reference](#7-api-reference)
8. [Database Schema](#8-database-schema)
9. [Supported Languages](#9-supported-languages)
10. [Google Cloud Setup](#10-google-cloud-setup)
11. [Environment Variables](#11-environment-variables)
12. [Running Locally](#12-running-locally)
13. [Demo Mode](#13-demo-mode)
14. [Deployment](#14-deployment)
15. [Key Design Decisions](#15-key-design-decisions)

---

## 1. Project Overview

PadhoSuno is a cross-platform mobile application (iOS, Android, and PWA) that helps users who cannot easily read printed documents in Indian languages. The user photographs a document — a medicine label, a government notice, a bill — and the app:

1. Extracts the text using Google Cloud Vision OCR
2. Detects the language automatically (Hindi, Marathi, Gujarati, or English)
3. Translates the text to the user's preferred language using **Sarvam AI** (`sarvam-translate:v1`)
4. Reads it aloud using **Sarvam AI Bulbul v3** voices (WAV, natural Indian-language TTS)

The app requires no login and works offline for history playback. A demo mode is available when no API keys are configured. Sarvam AI is the primary provider for TTS and Translation; Google Cloud APIs serve as fallback if only `GOOGLE_CLOUD_API_KEY` is set.

---

## 2. Target Users

- Visually impaired individuals who need documents read aloud
- Low-literacy users who can listen but not read
- Rural users receiving government documents in unfamiliar languages
- Elderly users with difficulty reading small print
- Anyone who needs a quick translation of an Indian-language document

---

## 3. Core Features

### OCR Scanning
- Photograph any document using the device camera or pick from the photo library
- Google Cloud Vision `DOCUMENT_TEXT_DETECTION` for high-accuracy Indic script recognition
- Automatic language detection from the image
- Graceful error messages for blurry or unreadable images

### Language Selection
- Persistent language preference bar (हिंदी / मराठी / ગુજ / Eng)
- User selects their preferred language once; it is saved across app restarts (AsyncStorage)
- Four supported languages: Hindi (`hi`), Marathi (`mr`), Gujarati (`gu`), English (`en`)

### Auto-Translation
- If the scanned document language differs from the user's preferred language, translation is triggered automatically after scanning
- Uses Google Cloud Translation API v2
- Both the original text and the translated text are shown side by side with clear labels
- Graceful fallback: if the API is unavailable, the original text is shown without crashing

### Read Aloud (TTS)
- Reads the translated text (or original if no translation needed) in the user's preferred language
- Uses Google Cloud Text-to-Speech with WaveNet neural voices for natural, accent-accurate pronunciation
- Playback speed control: 0.75× / 1× / 1.25× / 1.5× / 2×
- Pause / Resume / Replay controls
- Demo fallback: uses the device's built-in `SpeechSynthesis` API when no Google API key is set

### Scan History
- All scans are saved locally to a SQLite database
- History screen lists all past scans with timestamps
- Each history item can be played back (translates to preferred language on demand, then reads aloud)
- Individual scans can be deleted

### Demo Mode
- Runs fully without a Google Cloud API key
- Shows a mock Hindi medicine label for scanning
- Uses the browser or device built-in speech synthesis for TTS
- A banner informs the user they are in demo mode

---

## 4. Tech Stack

| Layer | Technology |
|---|---|
| Mobile Framework | Expo SDK 54 (React Native) |
| Navigation | Expo Router (file-based, similar to Next.js) |
| Server State | TanStack React Query v5 |
| Language State | React Context + AsyncStorage |
| Styling | React Native StyleSheet |
| UI Components | Ionicons, Expo Linear Gradient |
| Haptics | expo-haptics |
| Image Picker | expo-image-picker |
| Audio Playback | expo-av (native), Web Audio API (web) |
| Backend Runtime | Node.js + tsx |
| Backend Framework | Express.js |
| Database | SQLite via better-sqlite3 |
| ORM | Drizzle ORM |
| File Uploads | multer |
| OCR | Google Cloud Vision API |
| Translation | Google Cloud Translation API v2 |
| Text-to-Speech | Google Cloud TTS API (WaveNet voices) |
| Fonts | Inter (via @expo-google-fonts/inter) |

---

## 5. Architecture

```
┌─────────────────────────────────────────────┐
│              Expo App (Frontend)             │
│                                              │
│  app/(tabs)/index.tsx  ←→  Language Bar     │
│       ↕                        ↕             │
│  Scan Screen           LanguageContext       │
│  History Screen        (AsyncStorage)        │
│       ↕                                      │
│  hooks/useAudio.ts  (cross-platform audio)   │
│       ↕                                      │
│  lib/query-client.ts  (apiRequest + fetch)   │
└────────────────┬────────────────────────────┘
                 │ HTTP REST
┌────────────────▼────────────────────────────┐
│           Express Server (Backend)           │
│                  port 5000                   │
│                                              │
│  POST /api/scan      → Google Vision OCR     │
│  POST /api/translate → Google Translation    │
│  POST /api/tts       → Google WaveNet TTS    │
│  GET  /api/tts-audio/:id → Serve MP3        │
│  GET  /api/scans     → SQLite read           │
│  DELETE /api/scans/:id → SQLite delete       │
│                                              │
│  server/db.ts → Drizzle → SQLite            │
│  data/padho-suno.db                          │
└─────────────────────────────────────────────┘
```

### Request Flow (Scan → Translate → Read Aloud)

```
User taps camera
      ↓
expo-image-picker  →  image URI
      ↓
POST /api/scan (multipart/form-data)
      ↓
Google Vision API  →  extractedText + detectedLanguage
      ↓
Save to SQLite  →  scan.id
      ↓
Return to frontend: { extractedText, detectedLanguage, languageLabel, demoMode }
      ↓
IF detectedLanguage ≠ preferredLang:
  POST /api/translate  →  { translatedText, skipped }
  Show translated text block
      ↓
User taps "Read Aloud"
      ↓
POST /api/tts  →  { ttsAudioBase64, audioUrl }
      ↓
Native: stream from GET /api/tts-audio/:id (expo-av)
Web: decode base64 → Web Audio API
```

---

## 6. File Structure

```
padhosuno/
├── app/                          # Expo Router pages
│   ├── _layout.tsx               # Root layout: providers, fonts, splash screen
│   ├── +not-found.tsx            # 404 screen
│   ├── +native-intent.tsx        # Deep link handling
│   └── (tabs)/
│       ├── _layout.tsx           # Tab bar configuration (NativeTabs / BlurView)
│       ├── index.tsx             # Scan screen (main feature)
│       └── history.tsx           # Past scans list
│
├── server/
│   ├── index.ts                  # Express setup, CORS, static serving, PWA routing
│   ├── routes.ts                 # All API endpoints
│   ├── storage.ts                # SQLite CRUD operations via Drizzle
│   ├── db.ts                     # Drizzle + better-sqlite3 initialization
│   └── templates/
│       └── landing-page.html     # Landing page served at / (non-browser clients)
│
├── shared/
│   └── schema.ts                 # Drizzle table definitions + Zod types (shared)
│
├── context/
│   └── LanguageContext.tsx       # Language preference provider (hi/mr/gu/en)
│
├── hooks/
│   └── useAudio.ts               # Cross-platform audio hook (expo-av + Web Audio)
│
├── lib/
│   └── query-client.ts           # React Query client, apiRequest helper, getApiUrl()
│
├── constants/
│   └── colors.ts                 # App color palette (saffron, green, blue theme)
│
├── components/
│   ├── ErrorBoundary.tsx         # App-level crash boundary
│   ├── ErrorFallback.tsx         # Crash UI shown to user
│   └── KeyboardAwareScrollViewCompat.tsx
│
├── scripts/
│   ├── build.js                  # Production build script (native bundles)
│   └── web-build.js              # Expo web export → dist/ for PWA deployment
│
├── assets/
│   └── images/                   # App icon, splash, favicon, adaptive icons
│
├── data/
│   └── padho-suno.db             # SQLite database (created at runtime)
│
├── app.json                      # Expo configuration
├── package.json                  # Dependencies and scripts
├── tsconfig.json                 # TypeScript configuration
├── drizzle.config.ts             # Drizzle ORM configuration
└── replit.md                     # Replit environment notes
```

---

## 7. API Reference

All endpoints are served on port 5000. The frontend uses `getApiUrl()` from `lib/query-client.ts` which reads `EXPO_PUBLIC_DOMAIN` to construct the base URL.

---

### POST `/api/scan`

Uploads an image, runs OCR, saves the scan to the database.

**Request:** `multipart/form-data`
| Field | Type | Description |
|---|---|---|
| `image` | File | JPEG/PNG image of the document |

**Response:** `200 OK`
```json
{
  "id": 7,
  "extractedText": "SUBJECT:\n1 April 2026\n...",
  "detectedLanguage": "mr",
  "languageLabel": "Marathi",
  "demoMode": false
}
```

**Error responses:**
- `400` — No image file provided, or file too large (> 10 MB)
- `422` — No text detected in image, or unsupported language
- `500` — Google Vision API error

---

### POST `/api/translate`

Translates text from one supported language to another.

**Request:** `application/json`
```json
{
  "text": "आजचा दिवस खूप छान आहे",
  "sourceLanguage": "mr",
  "targetLanguage": "hi"
}
```

**Response:** `200 OK`
```json
{
  "translatedText": "आज का दिन बहुत सुहाना है।",
  "skipped": false
}
```

If `sourceLanguage === targetLanguage`, or if the API key is missing or errored:
```json
{
  "translatedText": "<original text>",
  "skipped": true
}
```

**Error responses:**
- `400` — Missing required fields

---

### POST `/api/tts`

Converts text to speech audio using Google WaveNet voices.

**Request:** `application/json`
```json
{
  "text": "आज का दिन बहुत सुहाना है।",
  "language": "hi"
}
```

**Response:** `200 OK`
```json
{
  "ttsAudioBase64": "//OExAAAAA...",
  "audioUrl": "/api/tts-audio/uuid-here",
  "demoMode": false
}
```

In demo mode (no API key):
```json
{
  "ttsAudioBase64": null,
  "demoMode": true
}
```

Audio is cached in memory for 15 minutes by UUID.

---

### GET `/api/tts-audio/:id`

Serves the cached MP3 audio buffer by UUID. Used by native clients for direct URL streaming via `expo-av`.

**Response:** `audio/mpeg` binary stream

- `200` — Audio bytes
- `404` — Audio expired or not found (cache TTL is 15 minutes)

---

### GET `/api/scans`

Returns all past scans, newest first.

**Response:** `200 OK`
```json
[
  {
    "id": 7,
    "imageFilename": null,
    "extractedText": "SUBJECT:\n1 April 2026...",
    "detectedLanguage": "mr",
    "createdAt": 1712345678
  }
]
```

---

### GET `/api/scans/:id`

Returns a single scan by ID.

---

### DELETE `/api/scans/:id`

Permanently deletes a scan from history.

**Response:** `200 OK` `{ "success": true }`

---

## 8. Database Schema

Defined in `shared/schema.ts` using Drizzle ORM.

```typescript
scans table:
  id               INTEGER  PRIMARY KEY AUTOINCREMENT
  image_filename   TEXT     (nullable — images are not stored, only filenames)
  extracted_text   TEXT     NOT NULL
  detected_language TEXT    NOT NULL  ('hi' | 'mr' | 'gu' | 'en')
  created_at       INTEGER  NOT NULL  (Unix timestamp in seconds)
```

The database file is stored at `data/padho-suno.db` and is created automatically on first run.

---

## 9. Supported Languages

| Code | Language | Script | TTS Voice | Notes |
|---|---|---|---|---|
| `hi` | Hindi | Devanagari | `hi-IN-Wavenet-D` | Default language |
| `mr` | Marathi | Devanagari | `mr-IN-Wavenet-A` | Similar script to Hindi |
| `gu` | Gujarati | Gujarati | `gu-IN-Wavenet-A` | |
| `en` | English | Latin | `en-IN-Wavenet-D` | Indian English accent |

All four languages are supported for OCR input, translation source/target, and TTS output.

---

## 10. Google Cloud Setup

The app uses a single Google Cloud API key (`GOOGLE_CLOUD_API_KEY`) for three services. All three must be enabled in the same Google Cloud project.

### APIs to Enable

1. **Cloud Vision API** — `vision.googleapis.com`
   - Used for: OCR text detection from images
   - Enable at: https://console.cloud.google.com/apis/library/vision.googleapis.com

2. **Cloud Text-to-Speech API** — `texttospeech.googleapis.com`
   - Used for: Converting translated/extracted text to WaveNet audio
   - Enable at: https://console.cloud.google.com/apis/library/texttospeech.googleapis.com

3. **Cloud Translation API** — `translate.googleapis.com`
   - Used for: Translating scanned text to the user's preferred language
   - Enable at: https://console.cloud.google.com/apis/library/translate.googleapis.com

### API Key Restrictions

If your API key has **API restrictions** enabled, make sure all three APIs above are in the allowed list. If using **HTTP referrer restrictions**, remove them — the key is used server-side (no browser referrer header is sent).

### Creating the API Key

1. Go to [Google Cloud Console → Credentials](https://console.cloud.google.com/apis/credentials)
2. Click **Create Credentials → API Key**
3. Copy the key and set it as the `GOOGLE_CLOUD_API_KEY` secret in Replit

---

## 11. Environment Variables

| Variable | Required | Description |
|---|---|---|
| `GOOGLE_CLOUD_API_KEY` | No* | Google Cloud API key for Vision, TTS, Translation |
| `SESSION_SECRET` | Yes | Express session secret |
| `PORT` | No | Server port (default: 5000) |
| `EXPO_PUBLIC_DOMAIN` | Build-time | Domain used by frontend to construct API URLs |
| `REPLIT_DEV_DOMAIN` | Auto | Injected by Replit; used for CORS and API URL |

*Without `GOOGLE_CLOUD_API_KEY`, the app runs in **Demo Mode** — mock OCR, browser TTS.

---

## 12. Running Locally

The project has two separate workflows that must both be running:

### Backend (Express server — port 5000)
```bash
npm run server:dev
```
This runs `tsx server/index.ts` in development mode with hot reload.

### Frontend (Expo dev server — port 8081)
```bash
npm run expo:dev
```
This runs the Expo bundler. Access the app at:
- **Web browser:** http://localhost:8081
- **iPhone/Android:** Scan the QR code with Expo Go

### Available npm Scripts

| Script | Description |
|---|---|
| `npm run server:dev` | Start Express backend in dev mode |
| `npm run expo:dev` | Start Expo frontend in dev mode |
| `npm run web:build` | Export Expo as PWA to `dist/` |
| `npm run server:build` | Compile TypeScript server to `dist-server/` |
| `npm run db:push` | Push Drizzle schema to SQLite |

---

## 13. Demo Mode

Demo mode activates automatically when `GOOGLE_CLOUD_API_KEY` is not set.

| Feature | Demo Mode Behaviour |
|---|---|
| OCR Scan | Returns a hardcoded mock Hindi medicine label text |
| Language Detection | Returns `"hi"` (Hindi) |
| Translation | Returns original text with `skipped: true` |
| TTS | Returns `ttsAudioBase64: null`; frontend falls back to `expo-speech` / `SpeechSynthesis` |
| UI indicator | Saffron banner: "Demo mode — add GOOGLE_CLOUD_API_KEY for real OCR" |

The app is fully usable in demo mode for UI testing and demonstrations.

---

## 14. Deployment

The app is deployed as a **Progressive Web App (PWA)** + **API server** on Replit.

### Build Steps

1. `npm run web:build` — Runs `scripts/web-build.js` which:
   - Sets `EXPO_PUBLIC_DOMAIN` to the production domain
   - Runs `npx expo export -p web` → outputs to `dist/`

2. `npm run server:build` — Compiles the Express server TypeScript to `dist-server/`

### Runtime

The single Express server on port 5000:
- Serves the Expo PWA (`dist/`) for browser clients (Safari, Chrome)
- Serves API routes (`/api/*`) for all clients
- Serves the Expo manifest (`/manifest`) for native Expo Go clients
- Serves a landing page at `/` for non-browser clients

### iOS Publishing (Expo Launch)

Replit's built-in **Expo Launch** handles the App Store submission:
1. Click the **Publish** button in Replit
2. Expo Launch builds the app and submits to the Apple App Store

Bundle ID: `com.padhosuno`

### PWA Installation (iPhone)

Users can install the PWA without the App Store:
1. Open the published URL in Safari on iPhone
2. Tap the Share button → **Add to Home Screen**
3. The app opens full-screen, like a native app

---

## 15. Key Design Decisions

### No Login Required
The target audience (rural, elderly, low-literacy users) should not face any barrier to entry. All data is stored locally in SQLite on the server — no accounts, no passwords.

### Audio Architecture
Native platforms stream audio directly from `GET /api/tts-audio/:id` using `expo-av`. Web uses base64 data URIs decoded into the Web Audio API. `expo-file-system` is intentionally not used — it caused issues with caching and is not needed.

### Language Bar Always Visible
The language preference is the most important control in the app. It sits in a fixed bar at the top of every screen so users can always see and change it before scanning.

### Dual Text Display
After scanning, both the original text (with "Original — Marathi" label) and the translated text (with "Translated to Hindi" label and saffron border) are shown. This helps users verify the translation is correct.

### WaveNet Voices
Standard TTS voices for Indian languages sound robotic and can be hard to distinguish. WaveNet neural voices are used for all four languages to provide clear, natural-sounding speech that is easier for the target audience to understand.

### Translation Error Resilience
If the Translation API fails for any reason (API not enabled, rate limit, network error), the endpoint returns `{ skipped: true }` with the original text rather than a 500 error. The app shows the original text and reads it in the detected language — always functional, never crashed.

### SQLite for Persistence
The app uses SQLite (via `better-sqlite3`) rather than a cloud database. This keeps costs at zero, requires no external service, and is appropriate for per-user local history. Deployed on a Replit VM (not autoscale) to ensure the database file persists across restarts.

---

*PadhoSuno was built for the people of India who deserve technology that speaks their language.*
