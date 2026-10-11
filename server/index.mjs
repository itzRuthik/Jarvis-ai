#!/usr/bin/env node
/**
 * server/index.mjs — JARVIS AI streaming proxy.
 *
 * Purpose: let the browser talk to ONE origin you control, while the AI provider
 * key stays in the server environment. Recommended for any public deployment.
 *
 *   Browser ──POST /v1/chat/completions──▶ this proxy ──▶ OpenAI / Gemini / Anthropic
 *                    (SSE passthrough)
 *
 * Security posture:
 *   • keys only ever read from process.env (never from the request)
 *   • strict CORS allowlist, no wildcard fallback
 *   • per-IP token-bucket rate limiting
 *   • prompt size, token cap and timeouts enforced server-side
 *   • optional Google Safe Browsing pre-check on URLs inside prompts
 *   • no request bodies or keys are logged
 *
 * Zero dependencies: Node 18.17+ standard library only.
 */

import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));

/* --------------------------------- config -------------------------------- */

async function loadEnv() {
  try {
    const raw = await readFile(join(HERE, '.env'), 'utf8');
    for (const line of raw.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eq = trimmed.indexOf('=');
      if (eq === -1) continue;
      const key = trimmed.slice(0, eq).trim();
      const value = trimmed.slice(eq + 1).trim().replace(/^["']|["']$/g, '');
      if (!(key in process.env)) process.env[key] = value;
    }
  } catch {
    // No .env file: environment variables only. Fine.
  }
}
await loadEnv();

const CONFIG = {
  port: Number(process.env.PORT || 8787),
  host: process.env.HOST || '0.0.0.0',
  origins: (process.env.ALLOWED_ORIGINS || 'http://localhost:5173,http://localhost:8787')
    .split(',').map((s) => s.trim()).filter(Boolean),
  proxyToken: (process.env.PROXY_TOKEN || '').trim(),
  provider: (process.env.AI_PROVIDER || 'openai').trim().toLowerCase(),
  rateLimit: Number(process.env.RATE_LIMIT_PER_MIN || 30),
  maxOutputTokens: Number(process.env.MAX_OUTPUT_TOKENS || 1200),
  maxPromptChars: Number(process.env.MAX_PROMPT_CHARS || 24000),
  safety: process.env.SAFETY_CHECKS === '1',
  safetyKey: process.env.GOOGLE_SAFETY_KEY || '',
  keys: {
    openai: process.env.OPENAI_API_KEY || '',
    gemini: process.env.GEMINI_API_KEY || '',
    anthropic: process.env.ANTHROPIC_API_KEY || ''
  },
  baseUrls: {
    openai: (process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1').replace(/\/+$/, ''),
    gemini: 'https://generativelanguage.googleapis.com/v1beta',
    anthropic: 'https://api.anthropic.com/v1'
  },
  models: {
    openai: process.env.OPENAI_MODEL || 'gpt-4o-mini',
    gemini: process.env.GEMINI_MODEL || 'gemini-2.0-flash',
    anthropic: process.env.ANTHROPIC_MODEL || 'claude-3-5-haiku-latest'
  }
};

/* ------------------------------- utilities ------------------------------- */

const log = (...args) => console.log(`[${new Date().toISOString()}]`, ...args);

const buckets = new Map();
function rateLimited(ip) {
  const now = Date.now();
  const windowStart = now - 60_000;
  const hits = (buckets.get(ip) || []).filter((t) => t > windowStart);
  hits.push(now);
  buckets.set(ip, hits);
  if (buckets.size > 5000) buckets.clear(); // crude memory guard
  return hits.length > CONFIG.rateLimit;
}

function corsHeaders(origin) {
  const allowed = origin && CONFIG.origins.includes(origin);
  return {
    'Access-Control-Allow-Origin': allowed ? origin : CONFIG.origins[0] || 'null',
    'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Max-Age': '600',
    Vary: 'Origin'
  };
}

const send = (res, status, body, headers = {}) => {
  const payload = typeof body === 'string' ? body : JSON.stringify(body);
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Content-Length': Buffer.byteLength(payload), ...headers });
  res.end(payload);
};

function readBody(req, limit = 256 * 1024) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > limit) { reject(new Error('Request body too large')); req.destroy(); return; }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

/** Flatten any provider's message content into plain text for validation. */
function promptText(messages = []) {
  return messages.map((m) => (Array.isArray(m.content)
    ? m.content.map((p) => p.text || '').join(' ')
    : String(m.content || ''))).join('\n');
}

async function safeBrowsingChecks(text) {
  if (!CONFIG.safety || !CONFIG.safetyKey) return { ok: true };
  const urls = [...new Set((text.match(/https?:\/\/[^\s"')]+/g) || []))].slice(0, 10);
  if (!urls.length) return { ok: true };
  try {
    const res = await fetch(`https://safebrowsing.googleapis.com/v4/threatMatches:find?key=${CONFIG.safetyKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client: { clientId: 'jarvis-ai', clientVersion: '1.1.0' },
        threatInfo: {
          threatTypes: ['MALWARE', 'SOCIAL_ENGINEERING', 'UNWANTED_SOFTWARE', 'POTENTIALLY_HARMFUL_APPLICATION'],
          platformTypes: ['ANY_PLATFORM'],
          threatEntryTypes: ['URL'],
          threatEntries: urls.map((url) => ({ url }))
        }
      })
    });
    const data = await res.json();
    if (data.matches?.length) return { ok: false, reason: `Blocked by Safe Browsing: ${data.matches[0].threatType}` };
  } catch (err) {
    log('safety check skipped:', err.message);
  }
  return { ok: true };
}

/* ------------------------------ provider calls ---------------------------- */

const trim = (s = '') => s.replace(/\/+$/, '');

function upstreamFor(provider, { messages, system, temperature, maxTokens, stream }) {
  if (provider === 'gemini') {
    const contents = messages.map((m) => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: Array.isArray(m.content)
        ? m.content.map((p) => (p.type === 'text'
          ? { text: p.text }
          : { inline_data: (() => {
            const match = (p.image_url?.url || '').match(/^data:(.+?);base64,(.*)$/);
            return match ? { mime_type: match[1], data: match[2] } : { mime_type: 'image/png', data: '' };
          })() }))
        : [{ text: String(m.content ?? '') }]
    }));
    const key = CONFIG.keys.gemini;
    if (!key) throw new Error('GEMINI_API_KEY is not configured on the server');
    const model = CONFIG.models.gemini;
    const url = `${CONFIG.baseUrls.gemini}/models/${encodeURIComponent(model)}:${stream ? 'streamGenerateContent?alt=sse&' : 'generateContent?'}key=${encodeURIComponent(key)}`;
    return {
      url,
      headers: { 'Content-Type': 'application/json' },
      body: { system_instruction: { parts: [{ text: system }] }, contents, generationConfig: { temperature, maxOutputTokens: maxTokens } }
    };
  }

  if (provider === 'anthropic') {
    const key = CONFIG.keys.anthropic;
    if (!key) throw new Error('ANTHROPIC_API_KEY is not configured on the server');
    return {
      url: `${CONFIG.baseUrls.anthropic}/messages`,
      headers: { 'Content-Type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
      body: {
        model: CONFIG.models.anthropic,
        system,
        max_tokens: maxTokens,
        temperature,
        stream,
        messages: messages.map((m) => ({
          role: m.role === 'assistant' ? 'assistant' : 'user',
          content: Array.isArray(m.content)
            ? m.content.map((p) => (p.type === 'text'
              ? { type: 'text', text: p.text }
              : { type: 'image', source: (() => {
                const match = (p.image_url?.url || '').match(/^data:(.+?);base64,(.*)$/);
                return match ? { type: 'base64', media_type: match[1], data: match[2] } : { type: 'base64', media_type: 'image/png', data: '' };
              })() }))
            : String(m.content ?? '')
        }))
      }
    };
  }

  // default: OpenAI-compatible wire protocol (OpenAI, Groq, OpenRouter, gateways)
  const key = CONFIG.keys.openai;
  if (!key) throw new Error('OPENAI_API_KEY is not configured on the server');
  return {
    url: `${trim(CONFIG.baseUrls.openai)}/chat/completions`,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
    body: { model: CONFIG.models.openai, messages, temperature, max_tokens: maxTokens, stream }
  };
}

/** Relay an upstream response to the client, normalising only what it must. */
async function relay(upstream, res, stream) {
  const contentType = upstream.headers.get('content-type') || '';
  res.writeHead(upstream.status, {
    'Content-Type': contentType || (stream ? 'text/event-stream; charset=utf-8' : 'application/json; charset=utf-8'),
    'Cache-Control': 'no-store',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no'
  });

  if (!upstream.body) { res.end(); return; }
  const reader = upstream.body.getReader();
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      res.write(Buffer.from(value));
    }
  } catch (err) {
    log('stream interrupted:', err.message);
  } finally {
    res.end();
  }
}

/* --------------------------------- routes --------------------------------- */

const server = createServer(async (req, res) => {
  const origin = req.headers.origin;
  const cors = corsHeaders(origin);
  const ip = (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.socket.remoteAddress || 'unknown';
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);

  if (req.method === 'OPTIONS') { res.writeHead(204, cors); res.end(); return; }

  if (req.method === 'GET' && (url.pathname === '/health' || url.pathname === '/')) {
    return send(res, 200, {
      status: 'ok',
      service: 'JARVIS AI proxy',
      version: '1.1.0',
      provider: CONFIG.provider,
      model: CONFIG.models[CONFIG.provider] || null,
      keyConfigured: Boolean(CONFIG.keys[CONFIG.provider]),
      rateLimitPerMin: CONFIG.rateLimit,
      allowedOrigins: CONFIG.origins,
      safetyChecks: CONFIG.safety
    }, cors);
  }

  if (req.method === 'GET' && url.pathname === '/v1/models') {
    return send(res, 200, {
      object: 'list',
      data: [{ id: CONFIG.models[CONFIG.provider] || 'jarvis-proxy', object: 'model', owned_by: `jarvis-proxy/${CONFIG.provider}` }]
    }, cors);
  }

  if (req.method !== 'POST' || url.pathname !== '/v1/chat/completions') {
    return send(res, 404, { error: { message: 'Not found. Use POST /v1/chat/completions.' } }, cors);
  }

  // ---- authorisation ----
  if (CONFIG.proxyToken) {
    const auth = req.headers.authorization || '';
    if (auth !== `Bearer ${CONFIG.proxyToken}` && auth !== `Bearer ${CONFIG.proxyToken}`.trim()) {
      return send(res, 401, { error: { message: 'Invalid or missing proxy token.' } }, cors);
    }
  }
  if (origin && !CONFIG.origins.includes(origin)) {
    return send(res, 403, { error: { message: `Origin ${origin} is not allowed by ALLOWED_ORIGINS.` } }, cors);
  }
  if (rateLimited(ip)) {
    return send(res, 429, { error: { message: `Rate limit reached (${CONFIG.rateLimit}/min). Try again shortly.` } }, cors);
  }

  // ---- request ----
  let payload;
  try {
    payload = JSON.parse(await readBody(req));
  } catch (err) {
    return send(res, 400, { error: { message: `Invalid JSON body: ${err.message}` } }, cors);
  }

  const messages = Array.isArray(payload.messages) ? payload.messages : [];
  if (!messages.length) return send(res, 400, { error: { message: 'messages[] is required.' } }, cors);

  const text = promptText(messages);
  if (text.length > CONFIG.maxPromptChars) {
    return send(res, 413, { error: { message: `Prompt too long (${text.length} chars, limit ${CONFIG.maxPromptChars}).` } }, cors);
  }

  const safety = await safeBrowsingChecks(text);
  if (!safety.ok) return send(res, 400, { error: { message: safety.reason } }, cors);

  const system = messages.find((m) => m.role === 'system')?.content || 'You are JARVIS, a concise personal AI assistant.';
  const conversation = messages.filter((m) => m.role !== 'system');
  const temperature = Math.min(Math.max(Number(payload.temperature ?? 0.7), 0), 2);
  const maxTokens = Math.min(Number(payload.max_tokens ?? payload.maxTokens ?? 900) || 900, CONFIG.maxOutputTokens);
  const stream = payload.stream !== false;

  let upstreamRequest;
  try {
    upstreamRequest = upstreamFor(CONFIG.provider, { messages: conversation, system, temperature, maxTokens, stream });
  } catch (err) {
    return send(res, 500, { error: { message: err.message } }, cors);
  }

  // The client may not override the model or the key — only the server decides.
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 120_000);
  req.on('close', () => { clearTimeout(timeout); controller.abort(); });

  try {
    const upstream = await fetch(upstreamRequest.url, {
      method: 'POST',
      headers: upstreamRequest.headers,
      body: JSON.stringify(upstreamRequest.body),
      signal: controller.signal
    });

    if (!upstream.ok && !upstream.headers.get('content-type')?.includes('event-stream')) {
      const detail = await upstream.text().catch(() => '');
      log(`upstream ${upstream.status} (${CONFIG.provider})`);
      return send(res, upstream.status, { error: { message: `Provider error ${upstream.status}`, detail: detail.slice(0, 600) } }, cors);
    }

    clearTimeout(timeout);
    await relay(upstream, res, stream);
  } catch (err) {
    clearTimeout(timeout);
    if (err.name === 'AbortError') return; // client went away
    log('proxy failure:', err.message);
    if (!res.headersSent) send(res, 502, { error: { message: `Upstream request failed: ${err.message}` } }, cors);
  }
});

server.listen(CONFIG.port, CONFIG.host, () => {
  const provider = CONFIG.provider;
  const keyOk = Boolean(CONFIG.keys[provider]);
  log(`JARVIS proxy listening on http://${CONFIG.host}:${CONFIG.port}`);
  log(`provider=${provider} model=${CONFIG.models[provider]} keyConfigured=${keyOk ? 'yes' : 'NO — set your key in .env'}`);
  log(`allowed origins: ${CONFIG.origins.join(', ')}`);
  if (!keyOk) log('⚠  No API key configured. The proxy will answer /health but reject completions.');
  log('Point the app at: Setup → AI engine → Custom, base URL http://localhost:%d/v1', CONFIG.port);
});
