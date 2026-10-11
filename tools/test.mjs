#!/usr/bin/env node
/**
 * tools/test.mjs — dependency-free test suite for the JARVIS core.
 *
 * Covers the parts of the project that must never silently regress: the
 * arithmetic parser, unit conversion, the offline Local Core, the storage layer,
 * Markdown escaping, password generation and the pure helpers.
 *
 *   node tools/test.mjs
 */

import { strict as assert } from 'node:assert';
import { readFile, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));

/* --------------------------- browser-ish shims --------------------------- */

function makeStorage() {
  const map = new Map();
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => { map.set(String(k), String(v)); },
    removeItem: (k) => { map.delete(k); },
    clear: () => map.clear(),
    key: (i) => [...map.keys()][i] ?? null,
    get length() { return map.size; }
  };
}

const define = (key, value) => Object.defineProperty(globalThis, key, { value, writable: true, configurable: true });

define('localStorage', makeStorage());
define('sessionStorage', makeStorage());
define('location', { origin: 'http://localhost', protocol: 'http:', hostname: 'localhost', href: 'http://localhost/app/' });
define('navigator', {
  ...(globalThis.navigator ? {} : {}),
  onLine: true,
  userAgent: 'node-test',
  language: 'en-US',
  platform: 'test',
  hardwareConcurrency: 4
});
if (!globalThis.crypto) define('crypto', (await import('node:crypto')).webcrypto);
if (!globalThis.performance) define('performance', (await import('node:perf_hooks')).performance);

/* ------------------------------- test runner ------------------------------ */

const results = [];
let currentSuite = 'general';

function suite(name) { currentSuite = name; console.log(`\n\x1b[36m${name}\x1b[0m`); }

async function test(name, fn) {
  try {
    await fn();
    results.push({ suite: currentSuite, name, ok: true });
    console.log(`  \x1b[32m✓\x1b[0m ${name}`);
  } catch (err) {
    results.push({ suite: currentSuite, name, ok: false, err });
    console.log(`  \x1b[31m✗\x1b[0m ${name}\n      ${err.message}`);
  }
}

function expectThrow(fn, match) {
  let threw = false;
  try { fn(); } catch (err) {
    threw = true;
    if (match && !match.test(err.message)) throw new Error(`threw "${err.message}" but expected ${match}`);
  }
  assert.ok(threw, 'expected the call to throw');
}

/* --------------------------------- imports -------------------------------- */

const { evaluateExpression, calculator, convert, unitCatalogue, utilities, formatNumber, sha256 } =
  await import('../app/js/tools.js');
const { localAnswer } = await import('../app/js/local-core.js');
const { renderMarkdown, escapeHtml, toPlainText, fmtClock, bytes, clamp, uuid } = await import('../app/js/util.js');
const store = await import('../app/js/store.js');
const { stripToolTags, parseToolCalls, buildSystemPrompt } = await import('../app/js/brain.js');
const { validateShell } = await import('./verify-shell.mjs');

/* ================================== tools ================================= */

suite('tools · arithmetic parser');
await test('evaluates basic precedence', () => {
  assert.equal(evaluateExpression('2+3*4'), 14);
  assert.equal(evaluateExpression('(2+3)*4'), 20);
  assert.equal(evaluateExpression('10-4-3'), 3);
});
await test('handles unary minus and division', () => {
  assert.equal(evaluateExpression('-5+2'), -3);
  assert.equal(evaluateExpression('100/4/5'), 5);
});
await test('supports functions, constants and factorial', () => {
  assert.equal(evaluateExpression('sqrt(144)'), 12);
  assert.equal(evaluateExpression('round(pi*100)/100'), 3.14);
  assert.equal(evaluateExpression('fact(5)'), 120);
  assert.equal(evaluateExpression('max(3, 9)'), 9);
});
await test('supports exponents and percentages', () => {
  assert.equal(evaluateExpression('2^10'), 1024);
  assert.equal(evaluateExpression('(15/100)*2400'), 360);
});
await test('rejects malformed and unsafe input', () => {
  expectThrow(() => evaluateExpression('2+'), /Malformed|Unbalanced/);
  expectThrow(() => evaluateExpression('(1+2'), /Unbalanced/);
  expectThrow(() => evaluateExpression('1/0'), /Division by zero/);
  expectThrow(() => evaluateExpression('alert(1)'), /Unknown symbol/);
  expectThrow(() => evaluateExpression('window.location'), /Unknown symbol|Unexpected/);
});
await test('calculator() returns formatted output', () => {
  const out = calculator('(1240*3.6)/7');
  assert.equal(Number(out.value.toFixed(4)), 637.7143);
  assert.match(out.display, /637\.71/);
});
await test('formatNumber is locale independent for integers', () => {
  assert.equal(formatNumber(1000), '1,000');
  assert.equal(formatNumber(0.5), '0.5');
});

suite('tools · unit conversion');
await test('converts length units', () => {
  assert.equal(Math.round(convert(100, 'km', 'mi') * 100) / 100, 62.14);
  assert.equal(convert(1, 'm', 'cm'), 100);
});
await test('converts temperature with offsets', () => {
  assert.equal(Math.round(convert(100, 'c', 'f')), 212);
  assert.equal(Math.round(convert(32, 'f', 'c')), 0);
  assert.equal(Math.round(convert(0, 'c', 'k')), 273);
});
await test('converts data and time units', () => {
  assert.equal(convert(1, 'gib', 'mib'), 1024);
  assert.equal(convert(2, 'h', 'min'), 120);
});
await test('rejects impossible conversions', () => {
  expectThrow(() => convert(1, 'kg', 'm'), /Cannot convert/);
  expectThrow(() => convert('abc', 'm', 'cm'), /must be a number/);
});
await test('unit catalogue covers every category', () => {
  const cats = new Set(unitCatalogue().map((u) => u.category));
  for (const expected of ['length', 'mass', 'volume', 'speed', 'data', 'time', 'temperature', 'area', 'energy', 'pressure']) {
    assert.ok(cats.has(expected), `missing category ${expected}`);
  }
});

suite('tools · utilities');
await test('dice rolls stay inside their range', () => {
  for (let i = 0; i < 200; i += 1) {
    const r = utilities.dice('d20', 3);
    assert.equal(r.rolls.length, 3);
    r.rolls.forEach((v) => assert.ok(v >= 1 && v <= 20, `roll out of range: ${v}`));
    assert.equal(r.total, r.rolls.reduce((a, b) => a + b, 0));
  }
});
await test('coin toss returns a known face', () => {
  assert.ok(['Heads', 'Tails'].includes(utilities.coin().result));
});
await test('sha256 matches the known digest', async () => {
  assert.equal(await sha256('hello world'), 'b94d27b9934d3e08a52e52d7da7dabfac484efe37a5380ee9088f7ace2efcde9');
});
await test('base64 round-trips unicode text', () => {
  const encoded = utilities.base64enc('JARVIS · At Your Service').value;
  assert.equal(utilities.base64dec(encoded).value, 'JARVIS · At Your Service');
});
await test('now() reports ISO, timezone and epoch', () => {
  const n = utilities.now();
  assert.ok(!Number.isNaN(Date.parse(n.iso)));
  assert.equal(typeof n.timezone, 'string');
  assert.ok(n.epoch > 0);
});

/* =-------------------------------- memory/offline core -------------------- */

suite('local core · offline assistant');
await test('greets the operator', () => {
  const out = localAnswer('hello jarvis');
  assert.match(out.text, /JARVIS|service|Good/i);
});
await test('answers the capability report', () => {
  const out = localAnswer('what can you do?');
  assert.match(out.text, /Maths|Conversions/i);
  assert.match(out.text, /Local Core|offline/i);
});
await test('computes maths from natural language', () => {
  const out = localAnswer('calculate (220*1.5)/4');
  assert.match(out.text, /82\.5/);
  assert.equal(out.tool, 'calculator');
});
await test('answers "what is 15% of 2400"', () => {
  const out = localAnswer("what is 15% of 2400");
  assert.match(out.text, /360/);
});
await test('converts units from prose', () => {
  const out = localAnswer('convert 100 km to miles');
  assert.match(out.text, /62\.1/);
});
await test('remembers and recalls a fact', () => {
  const saved = localAnswer('remember my name is Ruthik');
  assert.equal(saved.tool, 'remember');
  const recall = localAnswer('what do you remember?');
  assert.match(recall.text, /Ruthik/);
});
await test('forgets a fact', () => {
  localAnswer('remember favourite colour = cyan');
  const out = localAnswer('forget favourite colour');
  assert.match(out.text, /Deleted/i);
  assert.ok(!localAnswer('what do you remember?').text.includes('cyan'));
});
await test('creates and lists notes', () => {
  localAnswer('note Launch checklist = PWA, APK, release');
  assert.match(localAnswer('show notes').text, /Launch checklist/);
});
await test('creates and completes tasks', () => {
  localAnswer('add task: publish the release');
  assert.match(localAnswer('show tasks').text, /publish the release/i);
  assert.equal(localAnswer('complete task 1').tool, 'task-complete');
});
await test('reports the time', () => {
  assert.match(localAnswer('what time is it?').text, /\d{1,2}:\d{2}/);
});
await test('generates a password of the requested length', () => {
  const out = localAnswer('generate a 24 character password');
  const match = out.text.match(/```\n([^\n]+)\n```/);
  assert.ok(match, 'expected a fenced code block');
  assert.equal(match[1].length, 24);
});
await test('hashes text on demand', () => {
  const out = localAnswer('hash hello world');
  assert.equal(out.tool, 'sha256');
  assert.equal(out.data.text, 'hello world');
});
await test('honest fallback when offline and unconfigured', () => {
  const out = localAnswer('write me a haiku about nebulas');
  assert.equal(out.tool, 'fallback');
  assert.match(out.text, /Local Core/);
  assert.match(out.text, /Setup/);
});
await test('wake word is stripped from commands', () => {
  const out = localAnswer('Jarvis, what time is it?', { wakeWord: 'jarvis' });
  assert.match(out.text, /It is/);
});
await test('system report is requested, not invented', () => {
  assert.equal(localAnswer('status report').text, '__SYSTEM_REPORT__');
});

/* ============================== storage layer ============================= */

suite('storage · local persistence');
await test('settings round-trip', () => {
  store.saveSettings({ theme: 'amber', temperature: 0.3 });
  assert.equal(store.getSettings().theme, 'amber');
  assert.equal(store.getSettings().temperature, 0.3);
});
await test('session-only keys are not persisted to localStorage', () => {
  store.saveSettings({ sessionKeyOnly: true, apiKey: 'sk-secret-value' });
  const raw = localStorage.getItem('jarvis.v1.settings');
  assert.ok(!raw.includes('sk-secret-value'), 'API key leaked into persistent storage');
  assert.equal(sessionStorage.getItem('jarvis.v1.apiKeySession'), 'sk-secret-value');
  store.saveSettings({ sessionKeyOnly: false, apiKey: '' });
});
await test('memory, notes and tasks persist', () => {
  store.rememberFact('city', 'Chennai');
  assert.equal(store.memoryFacts().find((f) => f.key === 'city').value, 'Chennai');
  const note = store.addNote('Telemetry', 'all nominal');
  assert.ok(store.getNotes().some((n) => n.id === note.id));
  const task = store.addTask('review hud');
  store.toggleTask(task.id);
  assert.equal(store.getTasks().find((t) => t.id === task.id).done, true);
  store.deleteTask(task.id);
  assert.ok(!store.getTasks().some((t) => t.id === task.id));
});
await test('history respects the configured limit', () => {
  store.saveSettings({ historyLimit: 5 });
  store.clearHistory();
  for (let i = 0; i < 12; i += 1) store.pushHistory({ role: 'user', content: `m${i}`, ts: Date.now() });
  assert.equal(store.getHistory().length, 5);
  assert.equal(store.getHistory().at(-1).content, 'm11');
});
await test('export excludes credentials and import restores data', () => {
  store.rememberFact('exported', 'yes');
  const backup = store.exportAll();
  assert.ok(!backup.includes('apiKey": "sk-'), 'backup leaked a key');
  assert.match(backup, /"exported"/);
  store.clearMemory();
  store.importAll(backup);
  assert.equal(store.memoryFacts().find((f) => f.key === 'exported').value, 'yes');
});
await test('wipe clears everything', () => {
  store.wipeAll();
  assert.equal(store.memoryFacts().length, 0);
  assert.equal(store.getNotes().length, 0);
  assert.equal(store.getTasks().length, 0);
  assert.equal(store.getHistory().length, 0);
});
await test('storage footprint is reported as a number', () => {
  assert.equal(typeof store.storageFootprint(), 'number');
});

/* =============================== render layer ============================= */

suite('render · markdown and helpers');
await test('escapes raw HTML', () => {
  assert.equal(escapeHtml('<img src=x onerror=alert(1)>'), '&lt;img src=x onerror=alert(1)&gt;');
  const html = renderMarkdown('<script>alert(1)</script>');
  assert.ok(!html.includes('<script>'), 'raw script survived rendering');
});
await test('renders bold, italics, lists and inline code', () => {
  const html = renderMarkdown('**bold** and *italic* and `code`\n\n- one\n- two');
  assert.match(html, /<strong>bold<\/strong>/);
  assert.match(html, /<em>italic<\/em>/);
  assert.match(html, /<code>code<\/code>/);
  assert.match(html, /<ul>/);
  assert.equal((html.match(/<li>/g) || []).length, 2);
});
await test('renders fenced code blocks without swallowing them into lists', () => {
  const html = renderMarkdown('text\n\n```js\nconst a = 1;\n```');
  assert.match(html, /<pre><code data-lang="js">const a = 1;<\/code><\/pre>/);
});
await test('only allows http(s) links', () => {
  const html = renderMarkdown('[ok](https://example.com) [bad](javascript:alert(1))');
  assert.match(html, /href="https:\/\/example.com"/);
  assert.ok(!/href="javascript:/.test(html), 'javascript: URL was rendered');
});
await test('toPlainText strips markdown for speech', () => {
  assert.equal(toPlainText('**Bold** `code` [link](https://x.dev)'), 'Bold code link');
});
await test('clamp, bytes, fmtClock and uuid behave', () => {
  assert.equal(clamp(12, 0, 10), 10);
  assert.equal(bytes(1536), '1.5 KB');
  assert.match(fmtClock(new Date(2024, 0, 1, 9, 5, 7)), /09:05:07|9:05:07/);
  assert.match(uuid(), /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
});

/* =============================== brain plumbing =========================== */

suite('brain · tool protocol');
await test('strips and parses tool tags', () => {
  const text = 'Sure.\n[[search: latest AI news]]\n[[remember: name = Ruthik]]';
  const calls = parseToolCalls(text);
  assert.equal(calls.length, 2);
  assert.deepEqual(calls[0], { tool: 'search', arg: 'latest AI news' });
  assert.equal(calls[1].tool, 'remember');
  assert.equal(stripToolTags(text), 'Sure.');
});
await test('system prompt includes memory, tasks and date context', () => {
  store.rememberFact('name', 'Ruthik');
  store.addTask('finish the release');
  const prompt = buildSystemPrompt(store.getSettings());
  assert.match(prompt, /Ruthik/);
  assert.match(prompt, /finish the release/);
  assert.match(prompt, /CURRENT DATE\/TIME/);
});

/* ============================== static shell ============================== */

suite('shell · static integrity');
await test('required files exist', async () => {
  const required = [
    'app/index.html', 'app/app.css', 'app/sw.js', 'app/manifest.webmanifest',
    'app/js/main.js', 'app/js/ui.js', 'app/js/brain.js', 'app/js/providers.js',
    'app/icons/icon-192.png', 'app/icons/icon-512.png',
    'index.html', 'website.css', 'website.js', 'assets/og-image.png',
    'README.md', 'LICENSE'
  ];
  for (const file of required) {
    assert.ok(existsSync(join(ROOT, file)), `missing ${file}`);
  }
});
await test('service worker precache list matches real files', async () => {
  const sw = await readFile(join(ROOT, 'app/sw.js'), 'utf8');
  const list = [...sw.matchAll(/'\.\/([^']+)'/g)].map((m) => m[1]).filter((p) => !p.endsWith('/'));
  for (const asset of list) {
    assert.ok(existsSync(join(ROOT, 'app', asset)), `service worker precaches missing file: ${asset}`);
  }
});
await test('index.html loads every module through the entry point', async () => {
  const problems = await validateShell(ROOT);
  assert.deepEqual(problems, [], problems.join('\n'));
});
await test('no credentials or secrets are committed', async () => {
  const pattern = /sk-[A-Za-z0-9]{20,}|AIza[0-9A-Za-z_-]{30,}|xox[baprs]-|ghp_[A-Za-z0-9]{20,}/;
  const dirs = ['app', 'assets', 'server', 'tools', 'docs'];
  for (const dir of dirs) {
    const entries = existsSync(join(ROOT, dir)) ? await readdir(join(ROOT, dir), { recursive: true }) : [];
    for (const entry of entries) {
      if (!/\.(js|mjs|json|html|css|md|yml|yaml|example|txt)$/.test(entry)) continue;
      if (entry.includes('node_modules')) continue;
      const content = await readFile(join(ROOT, dir, entry), 'utf8');
      assert.ok(!pattern.test(content), `possible secret in ${dir}/${entry}`);
    }
  }
});
await test('manifest declares installable metadata', async () => {
  const manifest = JSON.parse(await readFile(join(ROOT, 'app/manifest.webmanifest'), 'utf8'));
  assert.equal(manifest.display, 'standalone');
  assert.ok(manifest.icons.some((i) => i.purpose === 'maskable'));
  assert.ok(manifest.icons.some((i) => i.sizes === '512x512'));
  assert.equal(manifest.theme_color, '#03070f');
});
await test('HTML references no external scripts, styles or fonts', async () => {
  for (const file of ['app/index.html', 'index.html']) {
    const html = await readFile(join(ROOT, file), 'utf8');
    const external = [...html.matchAll(/(?:src|href)="(https?:\/\/[^"]+)"/g)]
      .map((m) => m[1])
      .filter((url) => !/^https:\/\/(github\.com|itzruthik\.github\.io|platform\.openai|openrouter|console\.groq|aistudio\.google)/.test(url));
    assert.deepEqual(external, [], `${file} loads external resources: ${external.join(', ')}`);
  }
});

/* ================================== report ================================ */

const failed = results.filter((r) => !r.ok);
console.log(`\n${'─'.repeat(60)}`);
console.log(`  ${results.length - failed.length}/${results.length} checks passed`);
if (failed.length) {
  console.log(`\x1b[31m  ${failed.length} failing:\x1b[0m`);
  failed.forEach((f) => console.log(`   · [${f.suite}] ${f.name}\n     ${f.err.message}`));
  process.exit(1);
}
console.log('  \x1b[32mAll systems nominal.\x1b[0m');
