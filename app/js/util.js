/**
 * util.js — DOM helpers, safe Markdown rendering, toasts, audio blips.
 * Everything here is dependency-free and works offline.
 */

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

export function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') node.className = v;
    else if (k === 'text') node.textContent = v;
    else if (k === 'html') node.innerHTML = v;
    else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2), v);
    else if (v !== null && v !== undefined && v !== false) node.setAttribute(k, v === true ? '' : v);
  }
  for (const child of [].concat(children)) {
    if (child == null) continue;
    node.append(child.nodeType ? child : document.createTextNode(String(child)));
  }
  return node;
}

export const clamp = (n, min, max) => Math.min(max, Math.max(min, n));
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export function debounce(fn, ms = 250) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
}

export function uuid() {
  if (globalThis.crypto?.randomUUID) return crypto.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

export const escapeHtml = (str = '') =>
  String(str).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/**
 * Minimal, XSS-safe Markdown renderer.
 * Input is escaped first, so no raw HTML can survive; links are restricted to http(s).
 */
export function renderMarkdown(text = '') {
  const codeBlocks = [];
  let out = escapeHtml(text);

  out = out.replace(/```(\w+)?\n([\s\S]*?)```/g, (_, lang, body) => {
    codeBlocks.push(`<pre><code data-lang="${lang || 'text'}">${body.replace(/\n$/, '')}</code></pre>`);
    return `\u0000CB${codeBlocks.length - 1}\u0000`;
  });

  out = out.replace(/`([^`\n]+)`/g, '<code>$1</code>');
  out = out.replace(/^\s*[-*+]\s+(.*)$/gm, '<li>$1</li>');
  out = out.replace(/(<li>[\s\S]*?<\/li>)(?!\s*<li>)/g, '<ul>$1</ul>');
  out = out.replace(/^\s*(\d+)\.\s+(.*)$/gm, '<li data-ordered>$2</li>');
  out = out.replace(/(<li data-ordered>[\s\S]*?<\/li>)(?!\s*<li data-ordered>)/g, '<ol>$1</ol>');
  out = out.replace(/<li data-ordered>/g, '<li>');
  out = out.replace(/^###\s+(.*)$/gm, '<strong>$1</strong>');
  out = out.replace(/^##\s+(.*)$/gm, '<strong>$1</strong>');
  out = out.replace(/^#\s+(.*)$/gm, '<strong>$1</strong>');
  out = out.replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>');
  out = out.replace(/(^|[\s(])\*([^*\n]+)\*/g, '$1<em>$2</em>');
  out = out.replace(/(^|[\s(])_([^_\n]+)_/g, '$1<em>$2</em>');
  out = out.replace(/\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\)/g,
    '<a href="$2" target="_blank" rel="noopener noreferrer nofollow">$1</a>');
  out = out.replace(/(^|\s)(https?:\/\/[^\s<)]+)/g, (m, pre, url) =>
    `${pre}<a href="${url}" target="_blank" rel="noopener noreferrer nofollow">${url}</a>`);
  out = out.replace(/\u0000CB(\d+)\u0000/g, (_, i) => codeBlocks[Number(i)]);

  return out;
}

/** Plain-text preview used for speech and titles. */
export function toPlainText(md = '') {
  return md
    .replace(/```[\s\S]*?```/g, ' (code block) ')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '$1')
    .replace(/[*_#>]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function fmtClock(date = new Date()) {
  return date.toLocaleTimeString([], { hour12: false });
}

export function fmtTime(ts) {
  return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export function fmtDateTime(ts) {
  return new Date(ts).toLocaleString();
}

export function bytes(n) {
  if (!Number.isFinite(n)) return '—';
  const u = ['B', 'KB', 'MB', 'GB', 'TB'];
  let i = 0;
  while (n >= 1024 && i < u.length - 1) { n /= 1024; i += 1; }
  return `${n.toFixed(i === 0 ? 0 : 1)} ${u[i]}`;
}

export function toast(message, kind = 'info', ms = 3200) {
  const host = document.getElementById('toasts');
  if (!host) return;
  const node = el('div', { class: `toast toast--${kind}`, text: message, role: 'status' });
  host.append(node);
  setTimeout(() => {
    node.style.opacity = '0';
    setTimeout(() => node.remove(), 300);
  }, ms);
}

export function download(filename, content, mime = 'application/json') {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = el('a', { href: url, download: filename });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

let audioCtx = null;
/** Short synthesised interface blips — no audio files needed. */
export function beep(kind = 'ping', enabled = true) {
  if (!enabled) return;
  try {
    audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    const now = audioCtx.currentTime;
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    const freq = { ping: 880, send: 1180, recv: 660, err: 220, on: 520, off: 400 }[kind] || 800;
    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, now);
    osc.frequency.exponentialRampToValueAtTime(freq * (kind === 'err' ? 0.5 : 1.5), now + 0.12);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.05, now + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.22);
    osc.connect(gain).connect(audioCtx.destination);
    osc.start(now);
    osc.stop(now + 0.24);
  } catch { /* audio is a bonus, never fatal */ }
}

export async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    toast('Copied to clipboard', 'ok');
  } catch {
    toast('Clipboard unavailable in this context', 'err');
  }
}

export function relTime(ts) {
  const diff = Date.now() - ts;
  const mins = Math.round(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.round(hrs / 24)}d ago`;
}
