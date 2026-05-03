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
| `REPLIT_DEV_DOMAIN` | Auto-set by Replit; used for CORS and Expo packager proxy URL. |
| `REPLIT_DOMAINS` | Auto-set by Replit; additional allowed CORS origins. |
| `EXPO_PUBLIC_DOMAIN` | Set at dev startup to `$REPLIT_DEV_DOMAIN:5000`; used by the frontend to resolve the API base URL. |

---

## Project Structure

```
├── app/
│   ├── _layout.tsx                  Root layout — fonts, splash gate, providers
│   ├── +not-found.tsx
│   ├── +native-intent.tsx
│   └── (tabs)/
│       ├── _layout.tsx              Tab bar (Scan + History)
│       ├── index.tsx                Main scan / result / listen screen
│       └── history.tsx              Scan history list
│
├── components/
│   ├── AppSplashScreen.tsx          In-app animated splash overlay (web only)
│   ├── DrawerMenu.tsx               Slide-in hamburger drawer (4 groups + sub-modals)
│   ├── ErrorBoundary.tsx            App-level crash boundary
│   ├── ErrorFallback.tsx            Crash UI shown by ErrorBoundary
│   ├── KeyboardAwareScrollViewCompat.tsx
│   └── LanguagePickerModal.tsx      Full-screen 2-column language picker
│
├── context/
│   ├── LanguageContext.tsx          Global preferred language state (AsyncStorage-persisted)
│   └── PreferencesContext.tsx       Reading speed + text size preferences (AsyncStorage-persisted)
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
├── assets/
│   └── images/
│       ├── splash-icon.png          Branded splash icon (open book + sound waves on saffron circle)
│       └── icon.png                 App icon
│
├── burger-menu.json                 Static menu data for DrawerMenu (groups + items)
│
├── server/
│   ├── index.ts                     Express app entry point (port 5000)
│   ├── routes.ts                    All API routes
│   ├── storage.ts                   SQLite CRUD helpers
│   ├── db.ts                        Drizzle ORM database setup
│   └── templates/
│       └── landing-page.html        QR-code landing page served by the backend
│
├── shared/
│   └── schema.ts                    Drizzle ORM table schema + Zod validation types
│
└── app.json                         Expo config — splash colour #FF9933, bundle IDs, icon
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

## Splash Screen

### Native (Expo Go / device)
`SplashScreen.preventAutoHideAsync()` is called at module load. After the Inter fonts finish loading, `SplashScreen.hideAsync()` is delayed by **2200 ms** so the system splash (saffron background + branded icon from `app.json`) stays visible for over two seconds before the main app appears. No React component is involved on native.

### Web
`SplashScreen.hideAsync()` fires immediately when fonts load. A React in-app overlay (`components/AppSplashScreen.tsx`) renders **before** the provider tree in `_layout.tsx`:

```
if (Platform.OS === "web" && !splashDone) return <AppSplashScreen onFinished={...} />;
```

This guarantees no modal or provider can render beneath it. The component shows:
- Animated fade-in + spring scale of the branded book icon
- White "PadhoSuno" + "पढ़ो सुनो" title text
- "Scan · Translate · Listen" tagline
- "Powered by Sarvam AI" footer

After 2200 ms the overlay fades out, `splashDone` becomes `true`, and the full provider tree mounts. All `Animated.Value` refs use `useNativeDriver: false` on web to avoid runtime warnings.

---

## Header Bar

The top bar on the main scan screen contains three elements:

| Position | Element | Behaviour |
|---|---|---|
| Left | Hamburger icon (`menu-button`) | Opens the slide-in DrawerMenu |
| Centre | "PadhoSuno" title | Static label |
| Right | Language pill (`language-pill`) | Shows native script of current language (e.g. "मराठी"); tapping opens LanguagePickerModal |

---

## DrawerMenu (`components/DrawerMenu.tsx`)

A slide-in panel triggered by the hamburger icon. It renders as an `absoluteFillObject` View with `zIndex: 999` directly in the React tree — **not** a React Native `Modal` — so it works reliably on both web and native.

### Architecture
- `mounted` state (starts `false`) gates whether the View is in the tree at all, preventing invisible layers.
- When `visible` prop becomes `true`: `setMounted(true)` + `Animated.timing` slides the panel from `-DRAWER_WIDTH` to `0` and fades the backdrop from `0` to `1`.
- When `visible` becomes `false`: reverse animations run, then `setMounted(false)` removes the View.
- `useNativeDriver: Platform.OS !== "web"` on all `Animated.timing` calls.
- The backdrop is a full-screen `Pressable` (testID `drawer-backdrop`) that calls `onClose`.

### Menu Groups (from `burger-menu.json`)

| Group | Items |
|---|---|
| Preferences | Language, Reading Speed, Text Size |
| Information | How to Use, About |
| Community | Share App, Rate App |
| Support | Send Feedback, Privacy Policy |

### Inline Pickers
**Reading Speed** and **Text Size** rows expand in-place (no new screen) when tapped, showing chip selectors:
- Speed chips: 0.75×, 1×, 1.25×, 1.5×, 2×
- Size chips: Small, Medium, Large, X-Large

The current value is shown as a badge on the right of each row.

### Sub-Modals
"How to Use" and "About" open as `<Modal animationType="fade">` sheets from within the drawer. These are secondary overlays so using Modal here is appropriate.

---

## Preferences (`context/PreferencesContext.tsx`)

Exposes reading speed and text size to the entire app via React context. Both values are persisted to `AsyncStorage`.

| Value | Key | Options | Default | Effect |
|---|---|---|---|---|
| `defaultSpeed` | `@padhosuno_speed` | 0.75, 1, 1.25, 1.5, 2 | 1 | Applied as `playbackRate` for every new TTS playback |
| `textSize` | `@padhosuno_text_size` | small, medium, large, xlarge | medium | Drives `fontScale` (0.85 → 1.45) on extracted + translated text blocks |

`fontScale` values:

| Key | fontScale |
|---|---|
| small | 0.85 |
| medium | 1.0 |
| large | 1.2 |
| xlarge | 1.45 |

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

| Languages | Voice |
|---|---|
| English | ishita |
| Hindi, Marathi, Gujarati, Sanskrit | ritu |
| All other Indian languages | meera |

---

## Audio Architecture (`hooks/useAudio.ts`)

The `useAudio` hook abstracts playback across iOS, Android, and web:

- **Native (iOS/Android):** Uses `expo-av` `Audio.Sound.createAsync` with the streaming URL. `playsInSilentModeIOS: true` is set globally in `_layout.tsx` so audio plays even when the iPhone silent switch is on.
- **Web:** Uses the browser's `new Audio()` with a base64 data URI (no server round-trip needed).
- **Speed control:** `setRateAsync` on native; `playbackRate` on web. The initial speed is taken from `PreferencesContext.defaultSpeed`.
- **Cleanup:** Audio is stopped and unloaded on component unmount, when a new option is tapped, and when "Scan Another" is pressed.

State machine: `idle → loading → playing → paused → idle`

---

## Language Selection — First-Launch & Change Flow

### First Launch
On first launch (when `@padhosuno_lang_picked` is not set in AsyncStorage), `LanguagePickerModal` opens automatically in full-screen mode. The user must pick their preferred language before the main screen appears.

### Changing Language
The language pill in the top-right corner (showing the native script of the current language, e.g. "मराठी") opens the picker again in change mode. The selection is immediately persisted to AsyncStorage. The drawer's Language row also opens the same picker.

### LanguageContext (`context/LanguageContext.tsx`)
Exposes:
- `preferredLang` — current preferred language code
- `setPreferredLang(code)` — updates state and persists to AsyncStorage
- `getLangOption(code)` — looks up label and nativeLabel for any language code
- `hasPickedLanguage` — `false` until the user completes first-launch selection
- `markLanguagePicked()` — sets the flag in AsyncStorage

The provider returns `null` while loading from AsyncStorage so the UI never renders with a stale default.

---

## Reading Screen — Listen Panel

After a document is scanned, the result screen shows:

### Extracted Text Box
Always visible. Shows the extracted text in its original script with the detected language label. Font size scales with the user's Text Size preference.

### Translation Box (Synced)
Appears only when the preferred-language or Hindi listen option is active. Automatically switches language and accent colour to match whichever audio card is selected:
- Indigo theme when preferred language is active
- Green theme when Hindi is active
- Disappears when "Listen (Original)" is active
- Cached separately for preferred and Hindi so switching between them is instant without re-translating

### Listen Panel — Three Always-Visible Cards

All three cards are always visible — they do not disappear during playback.

| Card | Colour | Line 1 (native script) | Line 2 (English) |
|---|---|---|---|
| Original | Saffron / Orange | Native name of detected language (e.g. "मराठी") | Original · [Language] |
| Preferred | Indigo / Purple | Native name of preferred language (e.g. "हिंदी") | Translated · [Language] |
| Hindi | Green | हिंदी | Translated · Hindi |

The Hindi card is hidden when the preferred language is already Hindi.

**Active card behaviour:** Tapping a card starts audio for that language. The active card expands in-place showing:
- Large Pause / Play button
- Replay button (restarts from beginning in the same language)
- Stop button (collapses card back to idle)
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
| GET | `/api/scans` | Fetch all saved scans (history, newest first) |
| GET | `/api/scans/:id` | Fetch single scan |
| DELETE | `/api/scans/:id` | Delete a scan |

---

## Colour Palette (`constants/colors.ts`)

| Token | Hex | Usage |
|---|---|---|
| saffron | #FF9933 | Primary brand, original-language card, header accents, splash background |
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

## History Screen (`app/(tabs)/history.tsx`)

Lists all saved scans from the SQLite database. Each entry shows the detected language badge, an excerpt of the extracted text, and the date. Scans can be deleted individually. The list refreshes automatically after each new scan via React Query cache invalidation.

---

## Database

- **Engine:** SQLite via `better-sqlite3` (local file at `./data/padho-suno.db`)
- **ORM:** Drizzle ORM with Drizzle Kit for migrations (`drizzle.config.ts`)
- **Schema** (`shared/schema.ts`):
  - `scans` table: `id` (autoincrement PK), `image_filename` (nullable text), `extracted_text` (text), `detected_language` (text), `created_at` (unix timestamp integer)
- Validation via `drizzle-zod` generating Zod schemas from the Drizzle table definition
- The `./data/` directory is auto-created at startup if it doesn't exist
- No external database or cloud DB service is required

---

## Build & Dev Scripts

| Script | Purpose |
|---|---|
| `npm run server:dev` | Start Express backend in development mode (port 5000) |
| `npm run expo:dev` | Start Expo dev server with Replit proxy URLs (port 8081) |
| `npm run db:push` | Push schema changes to SQLite via Drizzle Kit |
| `npm run server:build` | Bundle server with esbuild for production |

**Replit workflows:**
- `Start Backend` — runs `npm run server:dev`
- `Start Frontend` — runs `npm run expo:dev`

---

## Demo Mode

If `GOOGLE_CLOUD_API_KEY` is not configured, the scan endpoint returns a hardcoded Hindi prescription text so developers can test the full translate → TTS → playback flow without needing API credentials. A blue banner on the result screen informs the user they are in demo mode.

---

## Known Constraints

- **expo-av deprecation:** SDK 54 deprecates expo-av in favour of expo-audio and expo-video. The migration is planned for a future release; the current implementation works correctly on all platforms.
- **Text length:** Sarvam TTS has an input character limit. Long documents may need chunking (not yet implemented).
- **OCR language detection:** Google Vision returns a `locale` code that is normalised server-side. Languages not in the Sarvam-supported list return a 422 error with a user-friendly message.
- **Audio cache TTL:** TTS audio files are stored in memory for 15 minutes. If a user tries to replay after that window, they will need to tap the option again to re-generate.
- **DrawerMenu on web:** Does not use a React Native `Modal` (portal layer) — uses an `absoluteFillObject` View with `zIndex: 999` to avoid click-propagation and rendering issues specific to React Native Web.
