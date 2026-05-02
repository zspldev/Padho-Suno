# PadhoSuno — Full Project Documentation

## Overview

PadhoSuno ("Read & Listen" in Hindi) is a mobile-first assistive app built for visually impaired and low-literacy users in India. It scans any physical document — prescriptions, ration cards, government letters, notices — extracts the printed text using Google Cloud Vision OCR, translates it into the user's preferred Indian language using Sarvam AI, and reads it aloud using Sarvam Bulbul v3 text-to-speech.

The design philosophy is minimal, icon-driven, and touch-first. Text is kept to a minimum; large tap targets, native-script labels, and high-contrast colour coding ensure the app is usable without a helper.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Mobile frontend | Expo SDK 54, React Native, Expo Router (file-based routing) |
| Backend | Express 5 + TypeScript, running on port 5000 |
| OCR | Google Cloud Vision API (Document Text Detection) |
| Translation | Sarvam AI Translate API |
| Text-to-Speech | Sarvam Bulbul v3 TTS API |
| Audio playback | expo-av (native), Web Audio API (web) |
| Database | better-sqlite3 via Drizzle ORM (scan history) |
| State / queries | TanStack React Query v5 |
| Fonts | Inter (400, 500, 600, 700) via @expo-google-fonts/inter |

---

## Environment Variables

| Variable | Purpose |
|---|---|
| `GOOGLE_CLOUD_API_KEY` | Google Cloud Vision OCR. If absent, app runs in demo mode with a mock Hindi prescription. |
| `SARVAM_API_KEY` | Sarvam AI translation and TTS. If absent, falls back to device speech synthesis (expo-speech / Web Speech API). |

---

## Project Structure

```
├── app/
│   ├── _layout.tsx                  Root layout — providers, fonts, audio mode
│   ├── +not-found.tsx
│   ├── +native-intent.tsx
│   └── (tabs)/
│       ├── _layout.tsx              Tab bar (Scan + History)
│       └── index.tsx                Main scan/result/listen screen
│
├── components/
│   ├── ErrorBoundary.tsx            App-level crash boundary
│   ├── ErrorFallback.tsx            Crash UI shown by ErrorBoundary
│   ├── KeyboardAwareScrollViewCompat.tsx
│   └── LanguagePickerModal.tsx      Full-screen 2-column language picker
│
├── context/
│   └── LanguageContext.tsx          Global preferred language state (AsyncStorage-persisted)
│
├── hooks/
│   └── useAudio.ts                  Cross-platform audio hook (expo-av + Web Audio API)
│
├── constants/
│   └── colors.ts                    Colour palette (saffron, indigo, green, etc.)
│
├── lib/
│   └── query-client.ts              TanStack QueryClient + API request helpers
│
├── server/
│   ├── index.ts                     Express app entry point (port 5000)
│   ├── routes.ts                    All API routes
│   ├── storage.ts                   SQLite CRUD helpers
│   ├── db.ts                        Drizzle ORM database setup
│   └── templates/
│       └── landing-page.html        Static landing page served by backend
```

---

## Supported Languages

All 22 officially recognised Indian languages as per the Eighth Schedule of the Constitution. The language list is defined in `context/LanguageContext.tsx` and the Sarvam mappings are in `server/routes.ts`.

| Code | Language | Native Script |
|---|---|---|
| as | Assamese | অসমীয়া |
| bn | Bengali | বাংলা |
| brx | Bodo | बड़ो |
| doi | Dogri | डोगरी |
| en | English | English |
| gu | Gujarati | ગુજરાતી |
| hi | Hindi | हिंदी |
| kn | Kannada | ಕನ್ನಡ |
| ks | Kashmiri | کٲشُر |
| kok | Konkani | कोंकणी |
| mai | Maithili | मैथिली |
| ml | Malayalam | മലയാളം |
| mni | Manipuri | মৈতৈলোন্ |
| mr | Marathi | मराठी |
| ne | Nepali | नेपाली |
| or | Odia | ଓଡ଼ିଆ |
| pa | Punjabi | ਪੰਜਾਬੀ |
| sa | Sanskrit | संस्कृत |
| sd | Sindhi | سنڌي |
| ta | Tamil | தமிழ் |
| te | Telugu | తెలుగు |
| ur | Urdu | اردو |

---

## Sarvam AI Integration

### Translation — `POST /api/translate`

Calls `https://api.sarvam.ai/translate` with:
- `input`: extracted text
- `source_language_code`: detected language BCP-47 code
- `target_language_code`: target language BCP-47 code
- `speaker_gender`: Female
- `mode`: formal
- `enable_preprocessing`: true

If the source and target language are identical, the translation step is skipped and the original text is read directly.

### Text-to-Speech — `POST /api/tts`

Calls `https://api.sarvam.ai/text-to-speech` (Bulbul v3 model) with:
- `inputs`: array of text chunks
- `target_language_code`: BCP-47 code from `SARVAM_LANG_CODE` map
- `speaker`: voice name from `SARVAM_SPEAKER` map
- `model`: bulbul:v3
- `enable_preprocessing`: true

The response is a base64-encoded WAV audio buffer. The backend decodes it, stores it in an in-memory cache (15-minute TTL) keyed by UUID, and returns:
- `ttsAudioBase64` — base64 WAV for web playback
- `audioUrl` — `/api/tts-audio/{id}` for native streaming

### TTS Audio Streaming — `GET /api/tts-audio/:id`

Serves the cached audio buffer with full HTTP range request support (`206 Partial Content`) to satisfy iOS AVPlayer's range-probe requirement. Without this, iOS returns error `-11850` (AVFoundationErrorDomain) and refuses to play.

### Sarvam Speaker Voice Map

Voices are assigned per language for the best quality:

| Languages | Voice |
|---|---|
| English | ishita |
| Hindi, Marathi, Gujarati, Sanskrit | ritu |
| All others (22 languages) | meera |

---

## Audio Architecture (`hooks/useAudio.ts`)

The `useAudio` hook abstracts playback across iOS, Android, and web:

- **Native (iOS/Android):** Uses `expo-av` `Audio.Sound.createAsync` with the streaming URL. `playsInSilentModeIOS: true` is set globally so audio plays even when the iPhone ring/silent switch is off.
- **Web:** Uses the browser's `new Audio()` with a base64 data URI (no server round-trip needed).
- **Speed control:** `setRateAsync` on native; `playbackRate` on web. Options: 0.75×, 1×, 1.25×, 1.5×, 2×.
- **Cleanup:** Audio is stopped and unloaded on component unmount, when a new option is tapped, and when "Scan Another" is pressed.

State machine: `idle → loading → playing → paused → idle`

---

## Language Selection — First-Launch & Change Flow

### First Launch
On first launch (when `@padhosuno_lang_picked` is not set in AsyncStorage), `LanguagePickerModal` opens automatically in full-screen mode. The user must pick their preferred language before the main screen appears.

### Changing Language
The language pill in the top-right corner of the header (showing the native script of the current preferred language, e.g. "मराठी") opens the picker again in change mode. The selection is immediately persisted to AsyncStorage.

### LanguageContext
`context/LanguageContext.tsx` exposes:
- `preferredLang` — current preferred language code
- `setPreferredLang(code)` — updates state and persists to AsyncStorage
- `getLangOption(code)` — looks up label and nativeLabel for any language code
- `hasPickedLanguage` — `false` until the user completes first-launch selection
- `markLanguagePicked()` — sets the flag in AsyncStorage

The provider returns `null` while loading from AsyncStorage so the UI never renders with a stale default.

---

## Reading Screen — Listen Panel

After a document is scanned, the result screen shows:

### Box 1 — Original Text
Always visible. Shows the extracted text in its original script with the detected language label.

### Box 2 — Translation (Synced)
Appears only when the preferred-language or Hindi listen option is active. Automatically switches language and accent colour to match whichever audio card is selected:
- Indigo theme when preferred language is active
- Green theme when Hindi is active
- Disappears when "Listen (Original)" is active
- Cached separately for preferred and Hindi so switching between them is instant without re-translating

### Listen Panel — Three Always-Visible Cards

All three cards are always visible on screen — they never disappear during playback.

| Card | Colour | Line 1 (native script) | Line 2 (English) |
|---|---|---|---|
| Original | Saffron / Orange | Native name of detected language (e.g. "मराठी") | Original · [Language] |
| Preferred | Indigo / Purple | Native name of preferred language (e.g. "हिंदी") | Translated · [Language] |
| Hindi | Green | हिंदी | Translated · Hindi |

The Hindi card is hidden when the preferred language is already Hindi.

**Active card behaviour:** Tapping a card starts audio for that language. The active card expands in-place showing:
- Large Pause / Play button
- Replay button (restarts from beginning in the same language)
- Stop button (collapses card back to idle, all three cards visible again)
- Speed chips: 0.75×, 1×, 1.25×, 1.5×, 2×

**Switching languages:** Tapping any idle card while another is playing stops the current audio immediately and starts the new language. No navigation required.

---

## API Routes Summary

| Method | Path | Description |
|---|---|---|
| POST | `/api/scan` | Upload image → OCR → detect language → save to DB → return text |
| POST | `/api/translate` | Translate text between Indian languages via Sarvam |
| POST | `/api/tts` | Generate speech audio via Sarvam Bulbul v3 |
| GET | `/api/tts-audio/:id` | Stream cached TTS audio (206 Partial Content supported) |
| GET | `/api/scans` | Fetch all saved scans (history) |
| GET | `/api/scans/:id` | Fetch single scan |
| DELETE | `/api/scans/:id` | Delete a scan |

---

## Colour Palette (`constants/colors.ts`)

| Token | Hex | Usage |
|---|---|---|
| saffron | #FF9933 | Primary brand, original-language card, header accents |
| saffronDark | #E8820A | Gradient end, active border |
| saffronLight | #FFF3E0 | Card backgrounds, light fills |
| saffronMuted | #FFE0B2 | Borders, subtle fills |
| indigo | #5C6BC0 | Preferred-language card |
| indigoDark | #3949AB | Active indigo border |
| indigoLight | #E8EAF6 | Preferred-language card background |
| indigoMuted | #C5CAE9 | Preferred-language card border (idle) |
| green | #138808 | Hindi card (Tricolour green) |
| greenLight | #E8F5E9 | Hindi card background |
| blue | #000080 | Tricolour navy (decorative) |
| error | #C62828 | Error states |
| success | #2E7D32 | Success / saved indicator |

---

## History Screen

`app/(tabs)/history.tsx` lists all saved scans from the SQLite database. Each entry shows the detected language badge, an excerpt of the extracted text, and the date. Scans can be deleted individually. The list refreshes automatically after each new scan via React Query cache invalidation.

---

## Demo Mode

If `GOOGLE_CLOUD_API_KEY` is not configured, the scan endpoint returns a hardcoded Hindi prescription text so developers can test the full translate → TTS → playback flow without needing API credentials. A blue banner on the result screen informs the user they are in demo mode.

---

## Known Constraints

- **expo-av deprecation:** SDK 54 deprecates expo-av in favour of expo-audio and expo-video. The migration is planned for a future release; the current implementation works correctly on all platforms.
- **Text length:** Sarvam TTS has an input character limit. Long documents may need chunking (not yet implemented).
- **OCR language detection:** Google Vision returns a `locale` code that is normalised server-side. Languages not in the Sarvam-supported list return a 422 error with a user-friendly message.
- **Audio cache TTL:** TTS audio files are stored in memory for 15 minutes. If a user tries to replay after that window, they will need to tap the option again to re-generate.
