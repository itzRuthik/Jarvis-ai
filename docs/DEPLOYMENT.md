# Deployment

JARVIS AI has three deployable pieces, and you only need the first one to be useful:

| Piece | Required? | What it does |
| --- | --- | --- |
| **Static site + web app** (repo root + `app/`) | Yes | The website and the whole assistant UI |
| **Android APK** (GitHub Releases) | Optional | Same app, installed natively |
| **Proxy server** (`server/`) | Optional, recommended for public use | Keeps the AI key off the client |

---

## 1. GitHub Pages (recommended, already wired)

The repository is laid out so Pages works **with the default settings** — no build step,
no branch shuffle:

```
/                       → index.html       (website)
/assets/og-image.png    → social preview
/app/                   → the JARVIS HUD
/404.html               → styled not-found page
```

### Enable it

**Settings → Pages → Build and deployment → Source: _Deploy from a branch_ → Branch: `main` / (root) → Save.**

Wait a minute, then visit `https://<user>.github.io/Jarvis-ai/`.

### Or let the workflow do it

`.github/workflows/pages.yml` publishes a minimal `_site/` (site + `app/`) through the
official Pages actions. Use it if you prefer **Settings → Pages → Source: GitHub Actions**
— it also keeps `capacitor/`, `server/` and `docs/` off the public site.

### Local preview that matches production exactly

```bash
node tools/serve.mjs
# website → http://localhost:5173/
# web app → http://localhost:5173/app/
```

### Custom domain

1. Add a `CNAME` file at the repository root containing your domain (e.g. `jarvis.example.com`).
2. Point a `CNAME` DNS record at `<user>.github.io`.
3. In Settings → Pages, set the custom domain and enable **Enforce HTTPS**.
4. Update the canonical/Open Graph URLs: `index.html` (`link[rel=canonical]`, `og:url`,
   `og:image`), `sitemap.xml`, `robots.txt`.

---

## 2. Any other static host

Netlify, Cloudflare Pages, Vercel (static), S3 + CloudFront, nginx, or a Raspberry Pi.
Publish the repository root, excluding `capacitor/`, `server/`, `tools/`, `docs/`.

```bash
rsync -av --exclude capacitor --exclude server --exclude tools --exclude docs \
      --exclude .git ./ user@host:/var/www/jarvis/
```

Requirements for full functionality:

- **HTTPS** — required for the microphone, speech recognition and service workers.
- **Correct MIME types** — `.webmanifest` must be served as `application/manifest+json`
  and the JS modules as `text/javascript`, or the PWA install will fail.
- **`Service-Worker-Allowed: /`** is only needed if you move `sw.js` outside `app/`.

---

## 3. The proxy server (hiding your API key)

GitHub Pages is static and cannot keep secrets. If you want a **public** deployment where
visitors do not supply their own key, run `server/` somewhere that executes Node:

```bash
cd server
cp .env.example .env      # ALLOWED_ORIGINS, provider key, limits
npm start                 # http://localhost:8787
```

### Environment reference

| Variable | Purpose |
| --- | --- |
| `PORT`, `HOST` | Listen address (default `8787`, `0.0.0.0`) |
| `ALLOWED_ORIGINS` | Comma-separated CORS allowlist — **never use `*`** |
| `AI_PROVIDER` | `openai` \| `gemini` \| `anthropic` |
| `OPENAI_API_KEY` / `GEMINI_API_KEY` / `ANTHROPIC_API_KEY` | Server-side credentials |
| `OPENAI_BASE_URL`, `*_MODEL` | Override upstream endpoint and model |
| `RATE_LIMIT_PER_MIN` | Per-IP request budget (protects your wallet) |
| `MAX_OUTPUT_TOKENS`, `MAX_PROMPT_CHARS` | Hard caps enforced server-side |
| `PROXY_TOKEN` | Optional shared secret the client must send |
| `SAFETY_CHECKS`, `GOOGLE_SAFETY_KEY` | Optional Safe Browsing pre-check of URLs in prompts |

### Point the app at it

**Setup → AI engine → Custom / self-hosted proxy**, base URL
`https://your-proxy.example.com/v1`. The API key field can stay empty — the server holds it.
If you set `PROXY_TOKEN`, paste it into the key field: the app sends it as a Bearer token.

### Hosting suggestions

| Host | Notes |
| --- | --- |
| Fly.io / Render / Railway | Free-ish tiers, easy Node deploys, automatic HTTPS |
| A VPS + nginx | Add `proxy_buffering off;` so SSE streams are not buffered |
| Cloudflare Workers | Possible, but you would port `server/index.mjs` to the Workers API |
| GitHub Pages | ❌ cannot run Node |

Add the deployed origin to `ALLOWED_ORIGINS` on the server, and keep the browser origin
(where the app is served from) in that list.

---

## 4. Android build & release

Covered in detail in **[ANDROID.md](ANDROID.md)**. In short: push to `main`, and the
`Android APK` workflow uploads a debug APK to the latest release. Tag releases manually
with `gh release create vX.Y.Z` for a stable download link.

---

## 5. Post-deploy checklist

```text
[ ] https://<host>/                     loads the website
[ ] https://<host>/app/                 loads the HUD, boot sequence completes
[ ] service worker registers (DevTools → Application → Service Workers)
[ ] “Install app” appears in the browser menu (PWA criteria met)
[ ] offline: disable the network, reload /app/ — the HUD still opens
[ ] Type “what can you do?” — the Local Core answers with no key configured
[ ] Setup → AI engine → Test connection returns a live reply (with your key)
[ ] Enable HTTPS, confirm the microphone prompt appears when pressing Listen
[ ] Download the APK from Releases and install it on a device
[ ] Check /robots.txt and /sitemap.xml resolve, and og:image renders in a link preview
```

---

## 6. Troubleshooting

| Symptom | Cause / fix |
| --- | --- |
| 404 on `https://user.github.io/Jarvis-ai/` after enabling Pages | Pages must be set to the branch **root**, not `/docs`. Wait 1–2 minutes after saving. |
| The site loads but the app shows `Fault detected` | Provider, model or key is wrong — open **Setup → AI engine** and use **Test connection**. |
| Microphone never prompts | Not HTTPS, or the browser blocked it; check the site permissions in the address bar. |
| PWA does not offer installation | The manifest or service worker did not load. Confirm `.webmanifest` MIME type and that `app/sw.js` is reachable. |
| Streams arrive all at once from your proxy | Disable response buffering on your host (`X-Accel-Buffering: no`, `proxy_buffering off`). |
| CORS error from the proxy | Add the exact browser origin to `ALLOWED_ORIGINS` (scheme + host + port). |
| Rate limit hit while testing | Raise `RATE_LIMIT_PER_MIN`, or restart the server to clear the in-memory buckets. |
