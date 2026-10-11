# Security & privacy

JARVIS AI is a bring-your-own-key assistant that runs mostly on your device. This document
states exactly what is stored, where it goes, and what the project does and does not
protect — including the limitations you should know about before pasting a key.

---

## 1. Reporting a vulnerability

Please **do not open a public issue** for security problems.

1. Use GitHub's [private vulnerability reporting](https://github.com/itzRuthik/Jarvis-ai/security/advisories/new)
   (Security → Report a vulnerability), or
2. Contact the maintainer through their GitHub profile.

Include: affected version/commit, reproduction steps, impact, and any suggested fix.
Expected first response: within 7 days. Please allow a reasonable disclosure window before
publishing details.

---

## 2. Secrets policy

| Rule | Enforcement |
| --- | --- |
| No keys in the repository | `.gitignore` blocks `.env*`, `*.jks`, `*.keystore`; CI scans sources for key-shaped strings (`sk-…`, `AIza…`, `ghp_…`, `xox…`) |
| No keys in the front end | The app bundle ships zero credentials; keys are read at runtime from your own browser storage |
| No keys in the server logs | The proxy never logs request bodies, headers or keys |
| No service-role keys anywhere | There is no database in this project; nothing of that kind is required |

If you fork this project, keep those properties — they are what makes the repository safe
to host publicly.

---

## 3. Where your data lives

| Data | Location | Cleared by |
| --- | --- | --- |
| API keys | `localStorage` (`jarvis.v1.settings`) or `sessionStorage` when session-only mode is on | Wipe local data / closing the tab (session mode) |
| Memory facts | `localStorage` (`jarvis.v1.memory`) | Memory panel → forget / wipe |
| Notes & tasks | `localStorage` (`jarvis.v1.notes`, `jarvis.v1.tasks`) | Delete buttons / wipe |
| Transcript | `localStorage` (`jarvis.v1.history`), capped by your history-limit setting | New session / clear transcript / wipe |
| Prompt content | Sent to the provider **you** configured, and nowhere else | — |
| Telemetry, analytics, tracking | **None. This project contains no analytics of any kind.** | n/a |

Backups (**Memory → Export all data**) deliberately **exclude the API key**.

---

## 4. What leaves the device

Only when you press send, and only to the endpoints you configure:

1. **Chat messages** → your selected provider (`api.openai.com`, `api.anthropic.com`,
   `generativelanguage.googleapis.com`, `openrouter.ai`, `api.groq.com`, or your proxy).
2. **Search queries** → your selected search provider (Wikipedia by default; Tavily, Brave
   or Serper if configured).
3. **Attached files** → inlined into the same provider request (images as data URLs, text
   and PDF text as prompt content).

The service worker explicitly **bypasses the cache** for every provider and search host, so
model traffic is never written to disk by the app.

---

## 5. The honest caveat about browser-side keys

Calling a provider directly from a browser means **the key is present in the browser**.
Anyone with access to that browser profile, or to an XSS foothold in the page, could read
it. Mitigations in this project:

- **Session-only mode** — keep the key in `sessionStorage` so it disappears when the tab closes.
- **Disposable keys** — create a key with a low spend/usage limit for browser use.
- **The proxy** — recommended for anything public: the key stays in the server environment
  and the browser only ever holds the proxy address.
- **Strict CSP** — no `unsafe-inline` scripts, no remote script origins, `connect-src` limited
  to HTTPS endpoints plus localhost for development.

If you deploy JARVIS for other people, use the proxy and set `PROXY_TOKEN`. Do not ship your
own key in a public static site; the browser cannot keep a secret.

---

## 6. Client-side hardening in this codebase

| Threat | Mitigation |
| --- | --- |
| XSS through model output | All Markdown is HTML-escaped first; only `http(s)` links are rendered; no `innerHTML` from raw user text |
| XSS through user data | `element.textContent` is used for notes, tasks and memory |
| Code execution through the calculator | A dedicated tokeniser/parser — **no `eval`, no `Function`**; unknown identifiers throw |
| Content injection via remote assets | No CDN, no external fonts, no third-party scripts; the whole shell is self-hosted |
| Clickjacking / mixed content | `base-uri 'self'`, `form-action 'none'`, HTTPS-only in the Android build |
| Accidental secret leakage | CI secret scan + `.gitignore` + export functions strip keys |
| Malicious attachments | Files are read as data URLs or plain text; no parsing that executes content; size caps (6 MB images, 120k chars text, 20k chars PDF) |

---

## 7. Server proxy hardening (`server/`)

| Control | Implementation |
| --- | --- |
| Key isolation | Keys read from `process.env` only; the model and key cannot be overridden by the client |
| CORS | Explicit allowlist (`ALLOWED_ORIGINS`), `Vary: Origin`, no wildcard fallback |
| Rate limiting | Per-IP token bucket (`RATE_LIMIT_PER_MIN`), in-memory with a size guard |
| Resource abuse | `MAX_PROMPT_CHARS` (413), `MAX_OUTPUT_TOKENS` clamp, 256 KB body limit, 120 s upstream timeout |
| Access control | Optional shared secret (`PROXY_TOKEN`) required as a Bearer token |
| Malicious links | Optional Google Safe Browsing pre-check of URLs inside prompts (`SAFETY_CHECKS=1`) |
| Logging | Status codes only — never prompts, keys or bodies |
| Dependencies | **None.** Node standard library only, so there is no supply chain to audit |

Run it behind HTTPS (a reverse proxy or your platform's TLS). If you expose it publicly,
add request logging at the edge, alert on 429 spikes, and rotate provider keys periodically.

---

## 8. Platform permissions

| Platform | Permission | When it is requested |
| --- | --- | --- |
| Browser | Microphone | The first time you press **Listen** |
| Android | `RECORD_AUDIO`, `MODIFY_AUDIO_SETTINGS` | On first voice use |
| Android | `INTERNET` | Always declared (required for network features) |

No location, contacts, SMS, storage, camera or notification permissions are requested.

---

## 9. Known limitations (accepted, documented)

1. **Browser-held keys are extractable** by design of the web platform — use the proxy for public deployments.
2. **Speech recognition is browser-dependent**; some environments have none, and Chrome's implementation sends audio to Google.
3. **Debug-signed APKs** are not Play-store verifiable; verify `SHA256SUMS.txt`.
4. **In-memory rate limiting** resets when the proxy restarts and is per-process only.
5. **No authentication on the web app itself** — anyone with the URL can open the UI; protection comes from not shipping credentials with it.
