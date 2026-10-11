<div align="center">

<img src="app/icons/icon-192.png" alt="JARVIS AI" width="120" height="120" />

# 🤖 JARVIS AI — Ultimate Personal AI Assistant

**“At Your Service. Always.”**

A futuristic personal AI assistant with a cinematic holographic HUD, voice interaction,
web search, smart tools, user-controlled memory and an offline core that keeps working
when the network does not.

[**▶ Launch the app**](https://itzruthik.github.io/Jarvis-ai/app/) ·
[**🌐 Website**](https://itzruthik.github.io/Jarvis-ai/) ·
[**📦 Download the Android APK**](https://github.com/itzRuthik/Jarvis-ai/releases/latest) ·
[**🐛 Report an issue**](https://github.com/itzRuthik/Jarvis-ai/issues)

![status](https://img.shields.io/badge/status-in%20development-yellow)
![licence](https://img.shields.io/badge/licence-MIT-blue)
![dependencies](https://img.shields.io/badge/runtime%20dependencies-0-brightgreen)
![engines](https://img.shields.io/badge/AI%20engines-6-blueviolet)
![pwa](https://img.shields.io/badge/PWA-installable-35d6ff)
![android](https://img.shields.io/badge/Android-APK-3ddc84)

</div>

---

## 📖 Contents

- [Vision](#-vision)
- [Screens & capabilities](#-screens--capabilities)
- [Try it in 10 seconds](#-try-it-in-10-seconds)
- [Key features](#-key-features)
- [Design philosophy](#-design-philosophy)
- [Technology stack](#-technology-stack)
- [Repository layout](#-repository-layout)
- [Installation](#-installation)
- [Environment configuration](#-environment-configuration)
- [Android app & APK](#-android-app--apk)
- [Deployment](#-deployment)
- [Privacy & security](#-privacy--security)
- [Roadmap](#-development-roadmap)
- [Contributing](#-contributions)
- [Licence](#-licence)

---

## 🚀 Vision

> Build a personal AI assistant that feels like a futuristic mission-control system:
> intelligent, responsive, visually immersive, and genuinely useful in everyday life.

JARVIS AI combines intelligent conversation, voice interaction, web search, practical
smart tools, user-controlled memory and a cinematic holographic interface into one
mobile-first application. It runs in a browser, installs as a PWA, and packages into an
Android APK — from a single, dependency-free codebase.

**JARVIS = “Just A Rather Very Intelligent System.”**

---

## 📸 Screens & capabilities

| Surface | What it is |
| --- | --- |
| **Holographic HUD** | Animated arc reactor, scanner sweep, particle field, live telemetry, glass panels, scanlines |
| **Conversation** | Streaming chat with Markdown, tool badges, latency readout, transcript export |
| **Voice** | Speech recognition, spoken replies, wake word, hands-free mode, reactive mic meter |
| **Tools** | Calculator, unit converter, notes, tasks, hashes, dice, passwords, timers |
| **Memory** | Local key→value facts injected into the prompt, fully exportable and wipeable |
| **Setup** | Providers, models, keys, personas, voice tuning, palettes, reduced motion |

The mobile layout stacks these into four thumb-reachable tabs; the desktop layout is a
mission-control grid.

---

## ⚡ Try it in 10 seconds

```text
1. Open  https://itzruthik.github.io/Jarvis-ai/app/
2. Say   “jarvis, what can you do?”
3. Do    maths, conversions, notes, tasks, timers — no key, no account, no network
```

Add your own AI key in **Setup → AI engine** to unlock full conversation, image
understanding and document reasoning. Nothing is uploaded unless you send it.

---

## ✨ Key features

| | Feature | Status |
| --- | --- | --- |
| 🔵 | **Futuristic HUD** — holographic interface inspired by sci-fi mission control | ✅ implemented |
| 🧠 | **AI intelligence** — OpenAI, Groq, OpenRouter, Gemini, Claude, custom proxy | ✅ implemented, needs your key |
| 🎙️ | **Voice assistant** — speech recognition + spoken replies (Web Speech APIs) | ✅ where the browser supports it |
| ⚡ | **Animated AI core** — rings, scanner, particles, voice-reactive waveform | ✅ implemented |
| 🌐 | **Web search** — Wikipedia (no key), Tavily, Brave, Serper | ✅ implemented |
| 💾 | **Smart memory** — user-controlled facts, local, exportable | ✅ implemented |
| 🛠️ | **AI tools** — calculator, converter, notes, tasks, hashes, dice, passwords, timers | ✅ implemented offline |
| 👁️ | **Image analysis** — attach or drop an image for vision models | ✅ needs a vision model |
| 📄 | **Document analysis** — text, code, CSV, JSON and PDF (built-in text extractor) | ✅ implemented |
| 📱 | **Mobile-first design** — Android-optimised touch UI + desktop grid | ✅ implemented |
| 🌙 | **Offline mode** — cached shell + Local Core answering tools and diagnostics | ✅ implemented |
| 📦 | **PWA support** — installable, maskable icons, shortcuts, standalone launch | ✅ implemented |
| 🔐 | **Security** — BYOK, strict CSP, session-only keys, optional server proxy | ✅ implemented |
| 🤖 | **Android APK** — Capacitor project + CI-built APK on every push | ✅ implemented |

Feature availability depends on implementation, browser support, permissions and the
external services you configure. The table above reflects this repository, not promises.

---

## 🎨 Design philosophy

- Deep black and navy backgrounds with a subtle holographic grid.
- Electric blue and cyan accents, glow, scanlines and a vignette.
- An animated circular AI core rendered on Canvas 2D.
- Real-time voice visualisation and futuristic status panels.
- Responsive layouts, safe-area aware, with reduced-motion support.

The interface is original work inspired by general science-fiction aesthetics. **JARVIS AI is
not an official Iron Man or Marvel product** and is not affiliated with, endorsed by or
derived from those properties — see the [NOTICE](LICENSE) section of the licence.

---

## 🧰 Technology stack

**Application (zero runtime dependencies)**

- **HTML5** — semantic, accessible structure
- **CSS3** — HUD styling, animation, responsive grid
- **JavaScript ES modules** — 13 modules, no build step, no bundler
- **Canvas 2D** — the animated AI core
- **Service worker** — offline app shell and PWA install
- **Web Storage** — settings, memory, notes, tasks, transcript

**Intelligence**

- OpenAI-compatible wire protocol → OpenAI, Groq, OpenRouter, custom gateways
- Google Gemini `generateContent` streaming
- Anthropic Claude Messages streaming
- **Local Core** — offline rule/tool engine, always armed
- Search: Wikipedia, Tavily, Brave, Serper

**Delivery**

- **GitHub Pages** — website + web app
- **GitHub Actions** — tests, shell verification, APK build, releases
- **Capacitor 6** — Android packaging
- **Node.js 18+** — optional key-hiding proxy (`server/`), same-origin streaming

---

## 📁 Repository layout

```text
Jarvis-ai/
├── index.html              marketing website (GitHub Pages root)
├── website.css / website.js
├── 404.html · robots.txt · sitemap.xml
├── assets/og-image.png     social preview
├── app/                    ⬅ the assistant itself
│   ├── index.html          HUD shell
│   ├── app.css
│   ├── manifest.webmanifest · sw.js · robots
│   ├── icons/  favicon.ico · 72→512 px · maskable
│   └── js/
│       ├── main.js         entry point
│       ├── ui.js           HUD wiring
│       ├── brain.js        orchestration + tool protocol
│       ├── local-core.js   offline engine
│       ├── providers.js    AI provider adapters
│       ├── search.js       search adapters
│       ├── docs.js         image / PDF / text ingestion
│       ├── voice.js        speech in, speech out, mic meter
│       ├── core-canvas.js  animated reactor
│       ├── tools.js        calculator, converter, utilities
│       ├── store.js        local persistence
│       ├── config.js       constants & defaults
│       └── util.js         DOM, Markdown, helpers
├── capacitor/              Android packaging (Capacitor)
│   ├── capacitor.config.json
│   ├── android/            native Gradle project (branded icons & splash)
│   └── scripts/prepare-www.mjs
├── server/                 optional streaming proxy (key stays server-side)
├── tools/                  dev server, tests, shell verifier
└── docs/                   Android, deployment and security guides
```

---

## 🔧 Installation

### Option A — run the static app (no tooling at all)

```bash
git clone https://github.com/itzRuthik/Jarvis-ai.git
cd Jarvis-ai
# open app/index.html, or serve the folder:
python3 -m http.server 5173
# → http://localhost:5173/
```

> Speech recognition, microphone access and service workers need **HTTPS or localhost**.
> `file://` works for everything else, including the offline tools.

### Option B — the bundled dev server (recommended)

```bash
git clone https://github.com/itzRuthik/Jarvis-ai.git
cd Jarvis-ai
npm run dev                   # = node tools/serve.mjs — zero dependencies, Node 18.17+
# website → http://localhost:5173/
# web app → http://localhost:5173/app/
```

> There is **no `npm install` and no build step**. The app is plain ES modules, so the test
> above needs nothing but Node. Install dev tooling (`npm install`, jsdom only) if you also
> want the optional DOM smoke test.

### Option C — install as an app (PWA)

Open the app in Chrome or Edge → menu → **Install app / Add to Home screen** → launch
from the icon for a fullscreen, offline-capable experience.

### Verify your checkout

```bash
node tools/verify-shell.mjs   # modules, assets, service worker, manifest, DOM contract
node tools/test.mjs           # 53 checks: parser, conversions, core, storage, security
npm run check                 # both of the above

# optional but recommended — boots the real HUD in a simulated DOM:
npm install                   # dev dependencies only (jsdom); the app itself has none
npm run smoke                 # 17 checks: boot, chat round trip, tools, settings, telemetry
```

---

## 🔑 Environment configuration

**The web app needs no environment file.** Keys are entered in **Setup → AI engine** and
stored on your device (or kept in memory only, if you enable session-only mode).

For a **server-side proxy** — the recommended setup for any public deployment, because it
keeps the key out of the browser entirely:

```bash
cd server
cp .env.example .env      # then edit it
npm start                 # → http://localhost:8787
```

```dotenv
PORT=8787
ALLOWED_ORIGINS=http://localhost:5173,https://itzruthik.github.io
AI_PROVIDER=openai            # openai | gemini | anthropic
OPENAI_API_KEY=sk-...         # server-side only, never in the browser
OPENAI_MODEL=gpt-4o-mini
RATE_LIMIT_PER_MIN=30
MAX_OUTPUT_TOKENS=1200
PROXY_TOKEN=                  # optional shared secret
```

Then in the app: **Setup → AI engine → Custom / self-hosted proxy**, base URL
`http://localhost:8787/v1` (or your deployed proxy URL), leaving the key field empty.

### Security rules (enforced by this repository)

- ❌ **Never commit API keys.** `.env` is git-ignored; a CI check scans for key-shaped strings.
- ❌ **Never put privileged keys in frontend JavaScript.** The bundle ships with none.
- ❌ **Never expose service-role database keys.** There is no database in this project.
- ✅ Use environment variables and server-side routes for anything privileged.
- ✅ Prefer a disposable key with a low spend limit if you must call a provider from a browser.

---

## 📱 Android app & APK

Every push to `main` that touches `app/` or `capacitor/` builds a debug APK in GitHub
Actions and attaches it to the [latest release](https://github.com/itzRuthik/Jarvis-ai/releases/latest)
with a `SHA256SUMS.txt`. Download it and sideload, or:

```bash
adb install JARVIS-AI-1.1.0-debug.apk
```

Build it yourself:

```bash
cd capacitor
npm install
npm run sync            # copies app/ → www/ and syncs the native project
npm run build:debug     # requires the Android SDK (JAVA 17+)
# APK → capacitor/android/app/build/outputs/apk/debug/app-debug.apk
```

The APK is **debug-signed**, which is what makes it installable without a Play Store
account. A signed release track (`bundleRelease` + AAB) is on the roadmap.

Full details, permissions and known platform limitations: **[docs/ANDROID.md](docs/ANDROID.md)**.

---

## 🌐 Deployment

| Piece | Where | Notes |
| --- | --- | --- |
| Website + web app | **GitHub Pages** | repo root (`index.html`) + `app/`; workflow in `.github/workflows/pages.yml` |
| — setup | **Settings → Pages → Source: GitHub Actions** | one click, once: Pages cannot be enabled by a workflow (API restriction) |
| AI keys | **your device** or **your proxy** | never in the repo |
| Optional proxy | any Node host (Render, Fly, Railway, VPS) | same-origin streaming, rate limited |
| Android | GitHub Releases | CI-built debug APK |

GitHub Pages cannot run the Node proxy: it serves static files only. If you want the key
hidden in a public deployment, host `server/` somewhere that runs Node and point the app at it.

Step-by-step instructions (including alternative hosts and custom domains):
**[docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)**.

---

## 🔐 Privacy & security

- **User-controlled memory** — facts, notes and tasks live in your browser; export or wipe anytime.
- **Clear permission requests** — the microphone is only requested when you press Listen.
- **Secure API configuration** — BYOK, session-only key mode, no keys in code or logs.
- **Input validation** — no `eval` (the calculator has its own parser), escaped Markdown,
  http(s)-only links, strict Content-Security-Policy.
- **Protected backend operations** — the optional proxy enforces CORS allowlisting, per-IP
  rate limits, prompt size caps, token caps, timeouts and optional Safe Browsing checks.
- **Transparency** — the status report tells you exactly which engine, model and shell you are running.

Report a vulnerability privately via the process in **[docs/SECURITY.md](docs/SECURITY.md)**.

---

## 🛣️ Development roadmap

- [x] Build the cinematic JARVIS interface
- [x] Implement the animated AI core
- [x] Create a responsive mobile dashboard
- [x] Develop the chat interface
- [x] Integrate configurable AI providers
- [x] Implement voice input and output
- [x] Add web search
- [x] Build the user-controlled memory system
- [x] Add calculator, notes and task management
- [x] Integrate image and document analysis
- [x] Implement offline functionality and the Local Core
- [x] Configure PWA installation
- [x] Prepare Android packaging and CI APK builds
- [x] Publish deployment instructions
- [~] Test security and performance (automated checks in place; independent audit welcome)
- [ ] Server-side streaming proxy hardening for larger public traffic
- [ ] Supabase-backed sync and accounts (optional, opt-in)
- [ ] Wake-word engine improvements and barge-in tuning
- [ ] Play Store release track (signed AAB)

Roadmap items are marked complete only after the corresponding functionality is
implemented and verified by the test suite or an end-to-end run.

---

## 🤝 Contributions

Contributions, suggestions, bug reports and feature ideas are welcome.

1. Describe the proposed change (issue first for anything non-trivial).
2. Keep the code dependency-free and organised — the app ships zero runtime packages.
3. Never commit credentials.
4. Run `npm run check` before opening a pull request.
5. Document any new configuration requirement.

See **[CONTRIBUTING.md](CONTRIBUTING.md)** and the **[Code of Conduct](CODE_OF_CONDUCT.md)**.

---

## 📄 Licence

Released under the **[MIT Licence](LICENSE)**. Read the NOTICE section: JARVIS AI is an
independent, fan-made project inspired by science-fiction aesthetics, not affiliated with
Marvel, Iron Man or any related rights holder.

---

<div align="center">

**JARVIS AI — Your Personal AI. Your Mission Control.**

*At Your Service. Always.*

</div>
