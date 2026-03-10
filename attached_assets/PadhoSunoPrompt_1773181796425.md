# PadhoSuno — Replit Project Build Prompt



## Prompt

Build a full-stack web prototype of **PadhoSuno** — a mobile-first web application for visually impaired and low-literacy users in India. The app lets users upload or capture a photo of any printed or handwritten document in an Indic language including English, converts the image to text using OCR, and reads the extracted text aloud using text-to-speech.

The prototype should run in a browser (mobile-responsive) as a stand-in for what will eventually become a Flutter mobile app. Use React + TypeScript + Vite on the frontend and Express + TypeScript on the backend, following the standard Replit fullstack template.

---

## Core User Flow

User Management Functionality
The user creates a new account with Name, Email ID, Password and Mobile Number
Each user gets his own unique ID and all the user data/history is saved in the SQLite db under that ID

Opeartional Flow
1. User opens the app and sees a large, clearly labelled "Scan Document" button
2. User taps the button — on mobile, this opens the device camera; on desktop, it opens a file upload dialog
3. User captures or uploads a photo of a printed or handwritten document (Hindi, English or other Indic language)
4. App uploads the image to the backend
5. Backend calls **Google Cloud Vision API** to extract text from the image
6. Backend detects the language of the extracted text and returns the extracted text to the frontend. Frontnd displays the text on the screen.
7. Front end shows a button 'Read aloud' when backend calls **Google Cloud Text-to-Speech API** to convert the text to spoken audio in the appropriate Indic language voice
8. App returns the audio to the frontend and plays the audio automatically
10. User can Pause, Resume, Replay, and adjust reading Speed (0.75x, 1x, 1.25x, 1.5x, 2x)
11. Each scanned image and extracted text is saved to the local SQLite database for history

---

## Tech Stack

- **Frontend:** React, TypeScript, Vite, TailwindCSS, shadcn/ui components
- **Backend:** Express.js, TypeScript, tsx
- **Database:** SQLite via better-sqlite3 + Drizzle ORM (local file, no external DB needed)
- **OCR:** Google Cloud Vision API (REST) — `GOOGLE_CLOUD_API_KEY` environment variable
- **TTS:** Google Cloud Text-to-Speech API (REST) — same `GOOGLE_CLOUD_API_KEY`
- **File uploads:** multer middleware for handling image uploads on the backend
- **Audio playback:** Browser native `<audio>` element with base64 audio from Google TTS

---

## Environment Variables Required

- `GOOGLE_CLOUD_API_KEY` — A Google Cloud API key with Cloud Vision API and Cloud Text-to-Speech API enabled. The user will provide this.

---

## Database Schema

One table: `scans`

| Column | Type | Notes |
|---|---|---|
| id | integer | primary key, auto-increment |
| imageFilename | text | filename of uploaded image stored on server |
| extractedText | text | OCR result from Google Cloud Vision |
| detectedLanguage | text | BCP-47 language code e.g. "hi", "ta", "te" |
| ttsAudioBase64 | text | base64-encoded MP3 from Google TTS (store for replay) |
| createdAt | integer | Unix timestamp |

---

## API Endpoints

### POST /api/scan
- Accepts: `multipart/form-data` with `image` field (JPG/PNG file, max 10MB)
- Backend flow:
  1. Save uploaded file temporarily
  2. Send image to Google Cloud Vision API (DOCUMENT_TEXT_DETECTION feature)
  3. Extract `fullTextAnnotation.text` from response
  4. Detect language from Vision API response (`textAnnotations[0].locale`) or use Google Translate Detect Language
  5. Map language code to a Google TTS voice (see voice mapping below)
  6. Send text to Google Cloud TTS API, receive base64 MP3 audio
  7. Save record to SQLite database
  8. Return JSON: `{ id, extractedText, detectedLanguage, ttsAudioBase64, languageLabel }`
- Error handling: Return clear error messages if image is unreadable, language unsupported, or API quota exceeded

### GET /api/scans
- Returns array of all past scans ordered by most recent first
- Each item: `{ id, extractedText, detectedLanguage, languageLabel, createdAt }` — exclude ttsAudioBase64 to keep response small

### GET /api/scans/:id/audio
- Returns: `{ ttsAudioBase64 }` for replaying a past scan

### DELETE /api/scans/:id
- Deletes a scan record from history

---

## Google Cloud Voice Mapping

Map detected language codes to Google Cloud TTS voices:

```
hi  → hi-IN-Standard-A (Hindi, female) or hi-IN-Standard-B (male)
mr  → mr-IN-Standard-A (Marathi, female)
gu  → gu-IN-Standard-A (Gujarati, female)
en  → en-IN-Standard-A (Indian English, female)
default → hi-IN-Standard-A
```

---

## Frontend Pages

### Main Screen (`/`)
- Full-screen mobile-first layout with a gradient background in saffron/green/blue tones (Indian flag inspiration, subtle)
- App name "PadhoSuno" in large, bold text at the top with a tagline: "पढ़ो सुनो — Photo lो, Suनो" (mix of Hindi/English for accessibility)
- A very large, prominent circular button with a camera icon labelled "Scan Document" — at least 120px diameter, easy to tap
- Below the button: a smaller "Upload from Gallery" link for desktop use
- Loading state: spinner with "Reading your document..." text while API call is in progress

### Result Screen (shown after successful scan, same page — not a new route)
- Detected language label shown as a badge (e.g., "Hindi detected")
- Estimated reading time (calculate from word count at 140 words/minute)
- Extracted text displayed in a scrollable box with large font (minimum 18px)
- Audio player with:
  - Large Play/Pause button (primary action)
  - Replay from start button
  - Speed selector: 0.75x | 1x | 1.25x | 1.5x | 2x
- "Scan Another" button to reset and scan a new document
- "Save to History" confirmation (auto-saved)

### History Screen (`/history`)
- List of past scans showing: language, first 100 characters of text, date/time
- Tap any item to re-read it (fetches audio from `/api/scans/:id/audio` and plays it)
- Delete button on each item
- Empty state: "No scans yet. Tap Scan Document to get started."

---

## Accessibility Requirements

Every interactive element must have:
- `aria-label` attributes describing the action
- `data-testid` attributes for testing
- Minimum tap target size 48x48px (use padding, not size, to achieve this)
- High contrast text (minimum 4.5:1 ratio against background)
- Screen reader announcements for loading states and results (use `aria-live="polite"` regions)
- All images have descriptive `alt` text
- Audio starts automatically after scan but user can pause immediately

---

## UI Design Principles

- Mobile-first layout (375px wide design, scales up for desktop)
- Use shadcn/ui components throughout
- Large fonts throughout: body text minimum 16px, headings 24px+
- Maximum 3 taps to complete the core flow (open app → scan → hear result)
- No complex menus or settings visible on the main screen
- Bottom navigation bar with two items: "Scan" (home) and "History"
- Colors: warm, Indian-inspired palette — saffron (#FF9933), deep green (#138808), dark blue (#000080) as accents on white background; avoid harsh red
- Show a brief one-time onboarding tooltip on first launch explaining the 3-step process

---

## Error States to Handle

- No API key configured → show setup instructions message
- Image too blurry or no text detected → "We couldn't read this document. Try better lighting or hold the camera steady."
- Unsupported language detected → "This language is not yet supported. We currently support Hindi, Tamil, Telugu, Bengali, Marathi, Kannada, Malayalam, and Gujarati."
- Network error → "Check your internet connection and try again."
- File too large (>10MB) → "Image too large. Please use a smaller photo."

---

## Seed / Demo Mode

If `GOOGLE_CLOUD_API_KEY` is not set, the app should run in **demo mode**:
- The scan button still works but uses a hardcoded mock OCR response
- Mock extracted text: a sample Hindi medicine label text
- Mock TTS: use browser's native `window.speechSynthesis` with a Hindi voice as fallback
- Show a banner: "Running in demo mode — add GOOGLE_CLOUD_API_KEY for real OCR"

This allows the UI to be developed and demonstrated without API costs.

---

## File Structure Guidance

```
server/
  index.ts          — Express entry point
  routes.ts         — All API route handlers
  storage.ts        — SQLite CRUD operations
  db.ts             — Drizzle + better-sqlite3 setup
  uploads/          — Temporary image upload storage (gitignored)
shared/
  schema.ts         — Drizzle SQLite schema
  routes.ts         — API contract (Zod schemas)
client/src/
  App.tsx           — Router setup
  pages/
    Home.tsx        — Main scan screen
    History.tsx     — Scan history
  components/
    ScanButton.tsx  — Large camera/upload button
    AudioPlayer.tsx — Play/pause/speed controls
    ResultPanel.tsx — Extracted text + audio player combined
    HistoryCard.tsx — Individual history item
  hooks/
    useScan.ts      — Mutation hook for POST /api/scan
    useHistory.ts   — Query hook for GET /api/scans
    useAudio.ts     — Audio playback state management
```

---

## Notes for the Builder

- Use `multer` with `storage: multer.memoryStorage()` — pass image as buffer directly to Google Vision API, no need to write to disk
- Google Cloud Vision API endpoint: `POST https://vision.googleapis.com/v1/images:annotate?key={API_KEY}`
- Google Cloud TTS API endpoint: `POST https://texttospeech.googleapis.com/v1/text:synthesize?key={API_KEY}`
- TTS request should use `audioEncoding: "MP3"` — return as base64 string in `audioContent` field
- Frontend plays audio via: `const audio = new Audio('data:audio/mp3;base64,' + audioContent); audio.play()`
- Do not store full audio in GET /api/scans list response — only fetch audio on demand via separate endpoint
- SQLite database file at `./data/padho-suno.db`
- All amounts and text sizes should assume the user is on a small Android screen with shaky hands
