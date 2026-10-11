# Contributing to JARVIS AI

Thanks for wanting to help. This project is deliberately small, dependency-free and easy
to audit — please help keep it that way.

---

## Before you start

- **Bug reports and feature ideas:** open an issue. Include your browser/device, the exact
  command you typed, what you expected, and what happened. Screenshots of the HUD help a lot.
- **Security issues:** do **not** open a public issue — follow [docs/SECURITY.md](docs/SECURITY.md).
- **Large changes:** describe the approach in an issue first so we do not duplicate work.

---

## Ground rules

1. **Zero runtime dependencies in the app.** `app/` must stay pure HTML/CSS/ES modules.
   Adding a bundler, a framework or an npm package to the front end will be declined unless
   there is an exceptional reason. Node is allowed for tooling, the proxy and CI.
2. **No credentials, ever.** Do not commit `.env`, keys, keystores or tokens. CI scans for them.
3. **Keep secrets out of the browser by default.** New provider integrations must read keys
   from local settings and must never embed one.
4. **No dead files.** Every module in `app/js/` must be reachable from `main.js` — the verifier fails otherwise.
5. **Match the design language.** Navy/cyan holographic aesthetic, monospace telemetry, subtle motion.
   Respect `prefers-reduced-motion` and small screens.
6. **Document configuration.** Anything new that needs a key, permission or env var must be
   documented in the README and the relevant file in `docs/`.

---

## Development workflow

```bash
git clone https://github.com/<you>/Jarvis-ai.git
cd Jarvis-ai
node tools/serve.mjs        # http://localhost:5173/  (website) + /app/ (assistant)
```

There is no build step. Edit a file, reload the page. The dev server disables caching so a
stale service worker cannot hide your change; if the PWA shell does cache, unregister the
service worker in DevTools → Application.

### Required checks before committing

```bash
npm run check               # or: node tools/verify-shell.mjs && node tools/test.mjs
node --check app/js/ui.js   # quick syntax check for any file you touched
```

`verify-shell.mjs` fails on: bare imports, missing assets, service-worker entries that do not
exist, manifest icons that do not exist, **DOM lookups that index.html cannot satisfy**, and
modules that nothing imports. `test.mjs` covers the parser, conversions, Local Core, storage
and the security properties (escaped HTML, http(s)-only links, no key in a backup).

### Adding a feature — where things go

| You are adding | Edit |
| --- | --- |
| A new offline command or tool function | `app/js/tools.js`, `app/js/local-core.js`, plus a test |
| A new AI provider | `app/js/config.js` (catalogue entry) + `app/js/providers.js` if the wire protocol is new |
| A new search provider | `app/js/search.js` + `SEARCH_PROVIDERS` in config |
| A HUD element | `app/index.html` + `app/app.css` + wiring in `app/js/ui.js` |
| A native Android concern | `capacitor/` (config, manifest, resources) + `docs/ANDROID.md` |
| A server concern | `server/index.mjs` + `server/.env.example` + `docs/SECURITY.md` |

If you add a file to `app/`, add it to the `SHELL` list in `app/sw.js` too — the verifier
will tell you if you forget.

---

## Style

- **JavaScript:** ES modules, 2-space indent, single quotes, semicolons, `const`/`let` only,
  named exports, no classes unless state genuinely warrants one (see `Reactor`, `Voice`).
- **CSS:** sectioned with comments, custom properties from `:root`, mobile-first media queries.
- **HTML:** semantic elements, ARIA where it adds meaning, `data-*` for state hooks.
- **Commits:** imperative subject line ≤ 72 chars, body explaining *why*.
  Conventional-commit prefixes (`feat:`, `fix:`, `docs:`, `chore:`, `test:`) are welcome.
- **Comments:** explain intent (why), not mechanics (what). Keep the "honest limitations"
  style of the existing docs — no marketing claims in code comments.

---

## Tests

Add a test for every bug fix and every new capability in `tools/test.mjs` (follow the
existing `suite()` / `test()` pattern). Tests must pass with plain `node`, no install step.
If a test needs a browser API, add a shim at the top of the file rather than a dependency —
see the existing `localStorage`/`navigator` shims.

---

## Pull requests

1. Branch from `main` (`feat/voice-barge-in`, `fix/pdf-extraction`, …).
2. Keep PRs focused; one concern each.
3. Include a screenshot or a short screen recording for UI changes.
4. Confirm `npm run check` passes and paste the summary line.
5. Update the README/roadmap checkbox if you completed a roadmap item.

By contributing you agree your work is licensed under the [MIT Licence](LICENSE) and that you
have the right to submit it — in particular, do not contribute copyrighted assets or artwork
belonging to third parties.
