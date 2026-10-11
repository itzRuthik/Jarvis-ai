# Changelog

All notable changes to JARVIS AI are documented here.
Format based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/); this project
follows [Semantic Versioning](https://semver.org/).

---

## [1.1.0] — 2026-10-11

The first complete release: the HUD, the offline core, configurable AI engines, voice,
search, memory, tools, PWA support and a CI-built Android APK.

### Added — the assistant (`app/`)

- **Holographic HUD** — glass panels, holographic grid, scanline sweep, boot sequence,
  live status chips (network, engine, state, clock), four accent palettes, reduced-motion mode.
- **Animated AI core** — Canvas 2D arc reactor: nested rotating arcs, tick ring, scanner
  sweep, particle field, pulsing nucleus, voice-reactive waveform, live FPS readout.
- **Conversation** — streaming responses, Markdown rendering (escaped, http(s)-only links,
  fenced code), typing indicator, tool badges, latency readout, stop generation, transcript
  export, suggestion chips.
- **Offline Local Core** — works with no key and no network: natural-language maths
  (`calculate (220*1.5)/4`, `15% of 2400`), unit conversion in prose, memory set/recall/forget,
  notes, tasks (add/list/complete), time and date, coin/dice/random, password generation,
  SHA-256, UUID, status report, and an honest fallback that explains how to connect an engine.
- **AI engines** — OpenAI, Groq, OpenRouter (OpenAI-compatible wire protocol), Google Gemini
  (`streamGenerateContent`), Anthropic Claude (Messages API) and any custom OpenAI-compatible
  proxy. Streaming with a `[[tool: …]]` protocol for web search, memory, tasks, notes and
  accurate arithmetic; vision support for attached images.
- **Web search** — Wikipedia (no key), Tavily, Brave Search, Serper, with automatic fallback
  to Wikipedia if a keyed provider fails.
- **Voice** — Web Speech recognition with interim transcripts, wake-word prefix handling,
  hands-free mode that re-arms after speaking, barge-in, spoken replies with voice/rate/pitch
  control, microphone level meter driving the reactor, and graceful degradation when the
  browser has no speech support.
- **Tools panel** — calculator with its own tokeniser/parser (**no `eval`**), unit converter
  across 11 categories, notes, tasks with priorities, hashes, dice, coins, passwords,
  UUIDs, base64, timers and a live telemetry grid.
- **Memory panel** — key→value facts, storage footprint, export/import/wipe, persona editing,
  full data controls, and an about/disclaimer section.
- **Documents** — image ingestion as data URLs, text/code/CSV/JSON inlining and a built-in
  best-effort PDF text extractor (via `DecompressionStream`).
- **Settings** — provider/model/key/base URL, temperature, token cap, session-only keys,
  persona prompt, connection test, search configuration, voice tuning, wake word, palettes,
  motion and sound preferences, transcript retention limit.
- **PWA** — service worker with an app-shell precache (provider and search traffic explicitly
  bypassed), installable manifest with maskable icons and app shortcuts, offline fallback page.

### Added — the website

- Marketing site at the repository root: hero with live phone mock, capability band,
  14 feature cards with honest status tags, interface/design section with a mock telemetry
  panel, technology stack, three installation paths, security section with the proxy
  configuration, roadmap with completion markers, FAQ, and a full footer with documentation links.
- Social preview image (`assets/og-image.png`), canonical/Open Graph/Twitter metadata,
  `robots.txt`, `sitemap.xml` and a styled `404.html`.

### Added — Android

- **Capacitor 6 Android project** (`capacitor/`) with branded launcher icons (all densities,
  round + adaptive foreground on a `#03070F` background), navy splash screens for every
  orientation and density, dark status/navigation bars, and microphone permissions.
- **CI APK builds** — `.github/workflows/android.yml` verifies the shell, runs the tests,
  builds with Gradle and attaches the APK plus `SHA256SUMS.txt` to the release.

### Added — infrastructure & docs

- Optional **Node proxy** (`server/`) with zero dependencies: streaming passthrough, CORS
  allowlist, per-IP rate limiting, prompt/token caps, timeouts, optional `PROXY_TOKEN` and
  optional Google Safe Browsing checks.
- **Tooling** — `tools/serve.mjs` (production-shaped static server), `tools/test.mjs`
  (53 checks) and `tools/verify-shell.mjs` (module graph, assets, service worker, manifest and
  DOM-contract integrity).
- **GitHub Actions** — CI on every push/PR, Pages deployment, Android APK build.
- **Documentation** — README, `docs/ANDROID.md`, `docs/DEPLOYMENT.md`, `docs/SECURITY.md`,
  CONTRIBUTING, Code of Conduct and this changelog; MIT licence with a third-party disclaimer.

### Security

- No credentials in the repository, the bundle or the logs; CI scans for key-shaped strings.
- Strict Content-Security-Policy with no remote script, style or font origins.
- All model output is escaped before Markdown rendering; only `http(s)` links are emitted.
- The calculator avoids `eval` entirely; unknown identifiers throw.
- Backups and exported settings strip the API key; the service worker never caches provider traffic.

### Known limitations

- Speech recognition depends on browser support and (in Chrome) requires a network connection.
- Android WebView speech input depends on the device's speech services; keyboard voice typing
  is the fallback.
- Direct browser→provider calls expose the key to that browser profile — use the proxy for
  public deployments.
- The APK is debug-signed and is not Play-Store distributable.

---

## [1.0.0] — 2026-10-11

- Initial commit: repository created with the project description.

[1.1.0]: https://github.com/itzRuthik/Jarvis-ai/releases/tag/v1.1.0
[1.0.0]: https://github.com/itzRuthik/Jarvis-ai/commit/fd99ae3c9316ac35e3dbc0cb1aba15b149ac5b3b
