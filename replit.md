# PadhoSuno — Replit Project Guide

## Overview

PadhoSuno is a mobile-first application designed for visually impaired and low-literacy users in India. It allows users to photograph or upload printed/handwritten documents, extract text using Google Cloud Vision OCR, and have that text read aloud using Google Cloud Text-to-Speech in the appropriate Indic language (Hindi, Marathi, Gujarati, or English).

The app is built as a React Native / Expo application (targeting mobile + web) with an Express.js backend. The backend handles image uploads, OCR via Google Cloud Vision API, text-to-speech via Google Cloud TTS API, and persists scan history in a local SQLite database.

**Key user-facing features:**
- First-session language picker: 22 Sarvam-supported Indian languages to choose from
- Header bar: burger menu icon (left), app title (centre), preferred language pill (right, tappable to change)
- Scan/upload a document photo
- Extract and display text (auto-detected language)
- Three listen options: Listen (original language), Read in Preferred Language, Read in Hindi
- Translate to chosen language then read aloud with Sarvam Bulbul v3 TTS
- Pause/resume/replay and speed controls (0.75x – 2x)
- View scan history with ability to replay audio for previous scans
- Demo mode fallback when Google Cloud API key is not configured

---

## User Preferences

Preferred communication style: Simple, everyday language.

---

## System Architecture

### Frontend (Expo / React Native)

- **Framework:** Expo SDK 54 with `expo-router` (file-based routing)
- **Language:** TypeScript with React 19
- **Navigation:** Tab-based layout with two screens — `Scan` (index) and `History`
- **Fonts:** Inter font family via `@expo-google-fonts/inter`
- **Styling:** React Native StyleSheet with a custom color palette (`constants/colors.ts`) themed around Indian flag colors (saffron, green, blue)
- **State/Data fetching:** TanStack React Query (`@tanstack/react-query`) for server state
- **Audio playback:** Custom `useAudio` hook (`hooks/useAudio.ts`) — uses `expo-av` on native, HTML `<audio>` element on web; plays base64-encoded audio returned from the TTS API
- **Image capture/upload:** `expo-image-picker` for camera and gallery access
- **Platform targets:** iOS, Android, and Web (mobile-responsive)
- **Path aliases:** `@/` maps to project root, `@shared/` maps to `./shared/`

### Backend (Express.js)

- **Framework:** Express 5 with TypeScript, run via `tsx`
- **Entry point:** `server/index.ts`
- **Routes:** `server/routes.ts` — registers API endpoints
- **Storage layer:** `server/storage.ts` — wraps Drizzle ORM queries for CRUD on scans
- **Database connection:** `server/db.ts` — initializes `better-sqlite3` and Drizzle ORM
- **File uploads:** `multer` with in-memory storage (max 10MB, images only)
- **CORS:** Custom middleware allowing Replit dev/production domains and localhost

**API Endpoints:**
- `POST /api/scan` — Upload image (multipart/form-data), run OCR, save scan to DB, return extracted text + detected language
- `GET /api/scans` — Retrieve all scan history (newest first)
- `GET /api/scans/:id` — Get a single scan by ID
- `DELETE /api/scans/:id` — Delete a scan
- `POST /api/tts` — Convert text to speech (JSON: {text, language}), return base64 MP3 audio

### Database

- **Engine:** SQLite via `better-sqlite3` (local file at `./data/padho-suno.db`)
- **ORM:** Drizzle ORM with Drizzle Kit for migrations (`drizzle.config.ts`)
- **Schema** (`shared/schema.ts`):
  - `scans` table: `id` (autoincrement PK), `image_filename` (nullable text), `extracted_text` (text), `detected_language` (text), `created_at` (unix timestamp integer)
- Validation via `drizzle-zod` generating Zod schemas from the Drizzle table definition
- The `./data/` directory is auto-created at startup if it doesn't exist

### Supported Languages

| Code | Language | TTS Voice |
|------|----------|-----------|
| `hi` | Hindi | hi-IN-Standard-A |
| `mr` | Marathi | mr-IN-Standard-A |
| `gu` | Gujarati | gu-IN-Standard-A |
| `en` | English | en-IN-Standard-A |

Language is auto-detected from OCR results. Falls back to a mock Hindi medicine label text in demo mode (no API key configured).

### Build & Dev Scripts

- `npm run server:dev` — Start Express backend in development mode
- `npm run expo:dev` — Start Expo with Replit proxy URLs set
- `npm run db:push` — Push schema changes to SQLite via Drizzle Kit
- `npm run server:build` — Bundle server with esbuild for production
- `scripts/build.js` — Custom Expo static web build script that handles Replit domain detection

---

## External Dependencies

### Required Environment Variables

| Variable | Purpose |
|----------|---------|
| `GOOGLE_CLOUD_API_KEY` | Google Cloud API key with Vision API and Text-to-Speech API enabled |
| `REPLIT_DEV_DOMAIN` | Auto-set by Replit; used for CORS and Expo packager proxy URL |
| `REPLIT_DOMAINS` | Auto-set by Replit; additional allowed CORS origins |
| `EXPO_PUBLIC_DOMAIN` | Set at dev startup to `$REPLIT_DEV_DOMAIN:5000`; used by frontend to resolve API base URL |

### Google Cloud APIs

- **Cloud Vision API** — REST API for OCR (text extraction from images). Called from the backend using the `GOOGLE_CLOUD_API_KEY`.
- **Cloud Text-to-Speech API** — REST API for converting extracted text to MP3 audio in Indic languages. Called from the backend; returns base64-encoded audio sent to the frontend.

### Key npm Packages

| Package | Role |
|---------|------|
| `expo` / `expo-router` | Mobile + web app framework and file-based routing |
| `expo-av` | Native audio playback |
| `expo-image-picker` | Camera and gallery image selection |
| `expo-speech` | Native TTS fallback (used in history screen) |
| `expo-linear-gradient` | UI gradient backgrounds |
| `@tanstack/react-query` | Server state management and caching |
| `express` | Backend HTTP server |
| `multer` | Multipart image upload handling |
| `better-sqlite3` | Synchronous SQLite driver |
| `drizzle-orm` / `drizzle-kit` | ORM and migration tooling |
| `drizzle-zod` | Auto-generated Zod validation from Drizzle schema |
| `react-native-gesture-handler` | Touch gesture support |
| `react-native-keyboard-controller` | Keyboard-aware scroll views |

### No External Database

The app intentionally uses a local SQLite file (`./data/padho-suno.db`) — no cloud database or external DB service is required or used.