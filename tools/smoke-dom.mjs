#!/usr/bin/env node
/**
 * tools/smoke-dom.mjs — boot the real HUD inside a simulated DOM.
 *
 * This is the closest thing to "open it in a browser" that runs in CI. It loads
 * app/index.html into jsdom, stubs the few browser APIs jsdom lacks (canvas 2d,
 * matchMedia, speech, audio), imports the real `app/js/main.js` module graph and
 * then exercises the UI: sending a message to the Local Core, running tools,
 * adding notes/tasks/memory, switching views and opening settings.
 *
 * jsdom is an *optional* dev dependency:
 *
 *     npm install --no-save jsdom && node tools/smoke-dom.mjs
 *
 * When jsdom is not installed the script exits 0 with a notice, so `npm run check`
 * stays dependency-free for everyone else.
 */

import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));

let JSDOM;
try {
  ({ JSDOM } = await import('jsdom'));
} catch {
  console.log('ℹ jsdom is not installed — skipping the DOM smoke test.');
  console.log('  Install it with:  npm install --no-save jsdom');
  process.exit(0);
}

const results = [];
const check = async (name, fn) => {
  try {
    const out = await fn();
    results.push({ name, ok: true });
    console.log(`  \x1b[32m✓\x1b[0m ${name}${out ? ` — ${out}` : ''}`);
  } catch (err) {
    results.push({ name, ok: false, err });
    console.log(`  \x1b[31m✗\x1b[0m ${name}\n      ${err.message}`);
  }
};

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

/* ------------------------------- environment ------------------------------ */

const html = await readFile(resolve(ROOT, 'app/index.html'), 'utf8');

const dom = new JSDOM(html, {
  url: 'http://localhost:5173/app/',
  runScripts: 'outside-only',
  pretendToBeVisual: true,
  resources: undefined
});
const { window } = dom;

// --- canvas 2d stub -------------------------------------------------------
const ctxStub = new Proxy({}, {
  get: (_, prop) => {
    if (prop === 'createLinearGradient' || prop === 'createRadialGradient') {
      return () => ({ addColorStop: () => {} });
    }
    if (prop === 'canvas') return { width: 520, height: 520 };
    return typeof prop === 'string' ? () => {} : undefined;
  },
  set: () => true
});
window.HTMLCanvasElement.prototype.getContext = () => ctxStub;
window.HTMLCanvasElement.prototype.getBoundingClientRect = () => ({ width: 320, height: 320, top: 0, left: 0, right: 320, bottom: 320 });

// --- API stubs jsdom does not implement -----------------------------------
window.matchMedia = window.matchMedia || ((query) => ({
  matches: false, media: query, onchange: null,
  addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {}, dispatchEvent: () => false
}));
window.scrollTo = () => {};
window.URL.createObjectURL = () => 'blob:stub';
window.URL.revokeObjectURL = () => {};
window.speechSynthesis = undefined;
window.AudioContext = undefined;
Object.defineProperty(window.navigator, 'onLine', { value: true, configurable: true });
window.navigator.clipboard = { writeText: async () => {} };

// jsdom lacks crypto.subtle in some versions; Node's webcrypto fills the gap.
if (!window.crypto?.subtle) {
  Object.defineProperty(window, 'crypto', { value: (await import('node:crypto')).webcrypto, configurable: true });
}

// expose the globals the modules expect (define, not assign: some are getters)
const define = (key, value) => Object.defineProperty(globalThis, key, { value, writable: true, configurable: true });
define('window', window);
define('document', window.document);
define('localStorage', window.localStorage);
define('sessionStorage', window.sessionStorage);
define('matchMedia', window.matchMedia);
define('location', window.location);
try { define('navigator', window.navigator); } catch { /* Node may lock the navigator getter */ }
define('speechSynthesis', undefined);
define('requestAnimationFrame', window.requestAnimationFrame.bind(window));
define('cancelAnimationFrame', window.cancelAnimationFrame.bind(window));
define('Notification', undefined);

const errors = [];
window.addEventListener('error', (event) => errors.push(event.error || event.message));
process.on('unhandledRejection', (reason) => errors.push(reason));

/* --------------------------------- boot ---------------------------------- */

console.log('\n\x1b[36mbooting the HUD in jsdom\x1b[0m');

let booted = false;
try {
  await import('../app/js/main.js');
  booted = true;
} catch (err) {
  console.log(`  \x1b[31m✗\x1b[0m module graph failed to load\n      ${err.stack?.split('\n').slice(0, 4).join('\n      ')}`);
}
if (!booted) { process.exit(1); }

// main.js waits for DOMContentLoaded; fire the boot path
window.document.dispatchEvent(new window.Event('DOMContentLoaded', { bubbles: true }));
await wait(60);
window.dispatchEvent(new window.Event('load'));
await wait(60);

await wait(1700);
await check('boot sequence completes', () => {
  const boot = window.document.getElementById('boot');
  if (!boot.classList.contains('is-done')) throw new Error('boot overlay never dismissed');
  return 'boot overlay dismissed';
});

await check('status chips are populated', () => {
  const text = window.document.getElementById('chat') ? '' : '';
  const net = window.document.getElementById('chipNet').textContent.trim();
  const provider = window.document.getElementById('chipProviderText').textContent.trim();
  if (!net) throw new Error('network chip is empty');
  if (!provider) throw new Error('provider chip is empty');
  return `${net} / ${provider}`;
});

await check('greeting rendered into the transcript', () => {
  const log = window.document.getElementById('log');
  if (!log.children.length) throw new Error('transcript is empty');
  return `${log.children.length} message block(s)`;
});

await check('reactor is animating', () => {
  const canvas = window.document.getElementById('core');
  if (!canvas) throw new Error('canvas missing');
  if (!canvas.width) throw new Error('canvas never sized');
  return `${canvas.width}×${canvas.height}`;
});

await check('suggestion chips rendered', () => {
  const chips = window.document.querySelectorAll('#suggestions .suggestion');
  if (chips.length < 4) throw new Error(`only ${chips.length} suggestions`);
  return `${chips.length} chips`;
});

await check('quick command grid rendered', () => {
  const buttons = window.document.querySelectorAll('#quickCommands .btn');
  if (buttons.length < 8) throw new Error(`only ${buttons.length} quick commands`);
  return `${buttons.length} commands`;
});

/* ------------------------------ interactions ------------------------------ */

console.log('\n\x1b[36minteractions\x1b[0m');

const api = window.JARVIS;
await check('console API exposed', () => {
  if (!api || typeof api.ask !== 'function') throw new Error('window.JARVIS missing');
  return `v${api.version}`;
});

// Local Core round trip through the real submit() path
window.document.getElementById('input').value = 'calculate (220*1.5)/4';
window.document.getElementById('composer').dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
await wait(700);

await check('local core answers through the UI', () => {
  const log = window.document.getElementById('log');
  const text = log.textContent;
  if (!/82\.5/.test(text)) throw new Error(`no answer found in transcript: ${text.slice(-200)}`);
  if (/Fault detected/.test(text)) throw new Error('a fault was reported during the turn');
  return '82.5 returned and rendered';
});

await check('telemetry updated after a turn', () => {
  const turns = window.document.getElementById('tmTurns').textContent.trim();
  const latency = window.document.getElementById('tmLatency').textContent.trim();
  if (turns !== '1') throw new Error(`session turns = ${turns}, expected 1`);
  return `turns=${turns} latency=${latency}`;
});

await check('memory panel stores a fact', () => {
  window.document.getElementById('memKey').value = 'commander';
  window.document.getElementById('memValue').value = 'Ruthik';
  window.document.getElementById('memAdd').click();
  const list = window.document.getElementById('memoryList').textContent;
  if (!list.includes('Ruthik')) throw new Error('memory entry was not rendered');
  return 'fact stored and listed';
});

await check('tools panel adds a note and a task', () => {
  window.document.getElementById('noteTitle').value = 'Smoke test';
  window.document.getElementById('noteBody').value = 'dom boot ok';
  window.document.getElementById('noteAdd').click();
  if (!window.document.getElementById('notesList').textContent.includes('Smoke test')) throw new Error('note not listed');

  window.document.getElementById('taskTitle').value = 'verify apk';
  window.document.getElementById('taskAdd').click();
  if (!window.document.getElementById('tasksList').textContent.includes('verify apk')) throw new Error('task not listed');
  return '1 note + 1 task';
});

await check('calculator panel evaluates expressions', () => {
  window.document.getElementById('calcInput').value = 'sqrt(1024) + 2^5';
  window.document.getElementById('calcRun').click();
  const out = window.document.getElementById('calcOut').textContent;
  if (!/64/.test(out)) throw new Error(`calculator said: ${out}`);
  return out.trim();
});

await check('unit converter works across categories', () => {
  window.document.getElementById('convValue').value = '100';
  window.document.getElementById('convFrom').value = 'km';
  window.document.getElementById('convTo').value = 'mi';
  window.document.getElementById('convTo').dispatchEvent(new window.Event('change', { bubbles: true }));
  window.document.getElementById('convFrom').dispatchEvent(new window.Event('change', { bubbles: true }));
  const out = window.document.getElementById('convOut').textContent;
  if (!/62/.test(out)) throw new Error(`converter said: ${out}`);
  return out.trim();
});

await check('views switch and the settings drawer opens', () => {
  window.document.body.dataset.view = 'tools';
  const tab = window.document.querySelector('.tabbar button[data-goto="memory"]');
  tab.click();
  if (window.document.body.dataset.view !== 'memory') throw new Error('view did not switch');
  window.document.getElementById('btnSettings').click();
  if (window.document.getElementById('drawer').hidden) throw new Error('settings drawer did not open');
  window.document.querySelector('[data-close]').click();
  if (!window.document.getElementById('drawer').hidden) throw new Error('settings drawer did not close');
  return 'tools → memory, drawer open/close';
});

await check('settings controls read and write configuration', () => {
  const provider = window.document.getElementById('setProvider');
  provider.value = 'groq';
  provider.dispatchEvent(new window.Event('change', { bubbles: true }));
  const chip = window.document.getElementById('chipProviderText').textContent.trim();
  if (!/GROQ/i.test(chip)) throw new Error(`provider chip did not follow: ${chip}`);

  const theme = window.document.getElementById('setTheme');
  theme.value = 'amber';
  theme.dispatchEvent(new window.Event('change', { bubbles: true }));
  if (window.document.documentElement.dataset.theme !== 'amber') throw new Error('theme did not apply');

  // restore the offline default so later checks are unaffected
  provider.value = 'local';
  provider.dispatchEvent(new window.Event('change', { bubbles: true }));
  return 'provider + theme persisted through the UI';
});

await check('system report builds without a network', async () => {
  if (!api?.systemReport) throw new Error('systemReport not exposed');
  const report = await api.systemReport();
  if (!/JARVIS system report/.test(report)) throw new Error(`unexpected report: ${report.slice(0, 120)}`);
  if (!/Engine/.test(report) || !/Local Core|offline/.test(report)) throw new Error('report is missing engine details');
  return `${report.split('\n').length} lines of diagnostics`;
});

await check('no runtime errors were thrown', () => {
  if (errors.length) throw new Error(errors.map((e) => e?.message || e).join(' | '));
  return 'clean';
});

/* --------------------------------- report --------------------------------- */

const failed = results.filter((r) => !r.ok);
console.log(`\n${'─'.repeat(60)}`);
console.log(`  ${results.length - failed.length}/${results.length} DOM checks passed`);
if (failed.length) {
  console.log('\x1b[31m  failing:\x1b[0m');
  failed.forEach((f) => console.log(`   · ${f.name}\n     ${f.err.message}`));
  window.close();
  process.exit(1);
}
console.log('  \x1b[32mThe HUD boots, answers and reacts to input.\x1b[0m');
window.close();
process.exit(0);
