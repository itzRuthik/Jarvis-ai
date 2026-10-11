#!/usr/bin/env node
/**
 * capacitor/scripts/prepare-www.mjs
 * Copies the single web app in ../app into capacitor/www so Capacitor can bundle it.
 * The copy is generated output: `capacitor/www` is git-ignored on purpose.
 */

import { cp, rm, mkdir, readdir, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = resolve(fileURLToPath(new URL('..', import.meta.url)));
const SRC = resolve(HERE, '..', 'app');
const DEST = join(HERE, 'www');

const SKIP = new Set(['.git', 'node_modules', 'readme.md']);

async function copyDir(from, to) {
  await mkdir(to, { recursive: true });
  for (const entry of await readdir(from)) {
    if (SKIP.has(entry.toLowerCase())) continue;
    const src = join(from, entry);
    const dst = join(to, entry);
    const info = await stat(src);
    if (info.isDirectory()) await copyDir(src, dst);
    else await cp(src, dst);
  }
}

if (!existsSync(SRC)) {
  console.error(`✗ Cannot find the web app at ${SRC}`);
  process.exit(1);
}

await rm(DEST, { recursive: true, force: true });
await copyDir(SRC, DEST);
console.log(`✓ Copied ${SRC} → ${DEST}`);
