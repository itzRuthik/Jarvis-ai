/**
 * tools/verify-shell.mjs — static integrity check for the web app shell.
 *
 * Walks the ES module graph from app/js/main.js, then confirms that every local
 * asset referenced by index.html, app.css, the service worker and the manifest
 * actually exists. This is what makes an offline app trustworthy: a single
 * missing file would break the cached shell on a phone with no signal.
 *
 * Exported as a function so the test suite can assert on the result, and runnable
 * directly (node tools/verify-shell.mjs) for CI.
 */

import { readFile, access } from 'node:fs/promises';
import { dirname, join, resolve, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const exists = async (file) => { try { await access(file); return true; } catch { return false; } };

async function walkModules(entry, root, seen = new Set(), problems = []) {
  const file = resolve(entry);
  if (seen.has(file)) return problems;
  seen.add(file);

  if (!(await exists(file))) {
    problems.push(`missing module: ${file.replace(root, '')}`);
    return problems;
  }

  const source = await readFile(file, 'utf8');
  const specifiers = [
    ...source.matchAll(/(?:^|\s)(?:import|export)[^'"()]*?from\s*['"]([^'"]+)['"]/g),
    ...source.matchAll(/import\s*\(\s*['"]([^'"]+)['"]\s*\)/g),
    ...source.matchAll(/import\s+['"]([^'"]+)['"]/g)
  ].map((m) => m[1]);

  for (const spec of specifiers) {
    if (!spec.startsWith('.')) {
      problems.push(`bare import "${spec}" in ${file.replace(root, '')} — the app must stay dependency-free`);
      continue;
    }
    await walkModules(join(dirname(file), spec), root, seen, problems);
  }
  return problems;
}

/**
 * @param {string} root repository root
 * @returns {Promise<string[]>} list of problems (empty means healthy)
 */
export async function validateShell(root) {
  const app = join(root, 'app');
  const problems = [];

  // 1. module graph
  await walkModules(join(app, 'js/main.js'), root, new Set(), problems);

  // 2. local references inside the HTML shell
  const html = await readFile(join(app, 'index.html'), 'utf8');
  const refs = [
    ...html.matchAll(/(?:href|src)="(\.\/[^"]+)"/g),
    ...html.matchAll(/url\((\.\/[^)]+)\)/g)
  ].map((m) => m[1]);

  for (const ref of refs) {
    const target = normalize(join(app, ref.replace(/^\.\//, '')));
    if (!(await exists(target))) problems.push(`index.html references missing asset: ${ref}`);
  }

  // 3. service worker precache list
  const sw = await readFile(join(app, 'sw.js'), 'utf8');
  const cached = [...sw.matchAll(/'\.\/([^']+)'/g)].map((m) => m[1]);
  for (const asset of cached) {
    if (asset === '') continue;
    if (!(await exists(join(app, asset)))) problems.push(`service worker precaches missing file: ${asset}`);
  }

  // 4. manifest icons
  const manifest = JSON.parse(await readFile(join(app, 'manifest.webmanifest'), 'utf8'));
  for (const icon of manifest.icons || []) {
    const target = join(app, icon.src.replace(/^\.\//, ''));
    if (!(await exists(target))) problems.push(`manifest icon missing: ${icon.src} (${icon.sizes})`);
  }

  // 5. every #id and .class the JavaScript looks up must exist in index.html
  const appJs = (await import('node:fs')).readdirSync(join(app, 'js'));
  const ids = new Set([...html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]));
  const classes = new Set([...html.matchAll(/class="([^"]+)"/g)].flatMap((m) => m[1].split(/\s+/)).filter(Boolean));
  const dataAttrs = new Set([...html.matchAll(/(data-[a-z-]+)/g)].map((m) => m[1]));

  for (const file of appJs) {
    const source = await readFile(join(app, 'js', file), 'utf8');
    for (const match of source.matchAll(/\$\('#([A-Za-z0-9_-]+)'/g)) {
      if (!ids.has(match[1])) problems.push(`js/${file} queries #${match[1]} but index.html has no such id`);
    }
    for (const match of source.matchAll(/\$\$?\(\s*'\.([A-Za-z0-9_-]+)/g)) {
      if (!classes.has(match[1])) problems.push(`js/${file} queries .${match[1]} but index.html has no such class`);
    }
    for (const match of source.matchAll(/\$\('\[(data-[a-z-]+)\]'\)/g)) {
      if (!dataAttrs.has(match[1])) problems.push(`js/${file} queries [${match[1]}] but index.html has no such attribute`);
    }
  }

  // 6. every JS module must be part of the module graph (no dead files)
  const dir = join(app, 'js');
  const modules = (await import('node:fs')).readdirSync(dir).filter((f) => f.endsWith('.js'));
  const graph = new Set();
  await collectGraph(join(dir, 'main.js'), graph);
  for (const module of modules) {
    const full = join(dir, module);
    if (!graph.has(resolve(full))) problems.push(`module never imported (dead code?): js/${module}`);
  }
  return problems;
}

async function collectGraph(file, set) {
  const full = resolve(file);
  if (set.has(full)) return set;
  set.add(full);
  const source = await readFile(full, 'utf8').catch(() => '');
  const specs = [
    ...source.matchAll(/from\s*['"](\.[^'"]+)['"]/g),
    ...source.matchAll(/import\s*\(\s*['"](\.[^'"]+)['"]\s*\)/g)
  ].map((m) => m[1]);
  for (const spec of specs) await collectGraph(join(dirname(full), spec), set);
  return set;
}

/* ------------------------------- CLI entry ------------------------------- */

const isMain = process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));
if (isMain) {
  const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
  const problems = await validateShell(ROOT);
  if (problems.length) {
    console.error('Shell verification failed:');
    problems.forEach((p) => console.error(` ✗ ${p}`));
    process.exit(1);
  }
  console.log('✓ App shell verified: modules, assets, service worker and manifest are all consistent.');
}
