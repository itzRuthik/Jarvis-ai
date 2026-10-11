/**
 * providers.js — AI provider adapters.
 *
 * All three wire protocols are implemented directly against the public HTTPS APIs:
 *   • openai    → POST {base}/chat/completions        (OpenAI, OpenRouter, Groq, custom proxies)
 *   • gemini    → POST {base}/models/{model}:streamGenerateContent
 *   • anthropic → POST {base}/messages
 *
 * Keys are read from local settings at call time. Nothing is bundled, nothing is logged.
 */

import { PROVIDERS } from './config.js';

class ProviderError extends Error {
  constructor(message, status, detail) {
    super(message);
    this.name = 'ProviderError';
    this.status = status;
    this.detail = detail;
  }
}

const trimSlash = (u = '') => String(u).replace(/\/+$/, '');

function resolveProvider(settings) {
  const preset = PROVIDERS[settings.provider] || PROVIDERS.local;
  if (preset.kind === 'local') return { preset, baseUrl: '' };
  const baseUrl = trimSlash(settings.baseUrl || preset.baseUrl || '');
  if (!baseUrl) throw new ProviderError('No base URL configured for this provider.', 0);
  return { preset, baseUrl };
}

function resolveModel(settings, preset) {
  const model = settings.model || preset.defaultModel || '';
  if (!model) throw new ProviderError('No model selected. Open Settings → AI engine.', 0);
  return model;
}

async function readError(res) {
  let detail = '';
  try {
    const text = await res.text();
    try {
      const data = JSON.parse(text);
      detail = data?.error?.message || data?.message || text;
    } catch { detail = text; }
  } catch { /* ignore */ }
  return new ProviderError(`Provider returned ${res.status}${detail ? `: ${String(detail).slice(0, 300)}` : ''}`, res.status, detail);
}

/** Turn an SSE response body into text deltas. */
async function* sseDeltas(res, extract) {
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';
    for (const raw of lines) {
      const line = raw.trim();
      if (!line || line.startsWith(':') || line.startsWith('event:')) continue;
      if (!line.startsWith('data:')) continue;
      const payload = line.slice(5).trim();
      if (payload === '[DONE]') return;
      let json;
      try { json = JSON.parse(payload); } catch { continue; }
      const piece = extract(json);
      if (piece) yield piece;
    }
  }
}

/* ------------------------------ normalisation ----------------------------- */

function toOpenAIMessages(system, messages) {
  return [{ role: 'system', content: system }, ...messages];
}

function toGeminiContents(messages) {
  return messages.map((m) => {
    const parts = [];
    if (Array.isArray(m.content)) {
      for (const part of m.content) {
        if (part.type === 'text') parts.push({ text: part.text });
        else if (part.type === 'image_url') {
          const url = part.image_url?.url || '';
          const match = url.match(/^data:(.+?);base64,(.*)$/);
          if (match) parts.push({ inline_data: { mime_type: match[1], data: match[2] } });
        }
      }
    } else {
      parts.push({ text: String(m.content ?? '') });
    }
    return { role: m.role === 'assistant' ? 'model' : 'user', parts };
  });
}

function toAnthropicMessages(messages) {
  return messages.map((m) => {
    const content = Array.isArray(m.content)
      ? m.content.map((p) => (p.type === 'text'
        ? { type: 'text', text: p.text }
        : { type: 'image', source: (() => {
          const match = (p.image_url?.url || '').match(/^data:(.+?);base64,(.*)$/);
          return match ? { type: 'base64', media_type: match[1], data: match[2] } : { type: 'base64', media_type: 'image/png', data: '' };
        })() }))
      : String(m.content ?? '');
    return { role: m.role === 'assistant' ? 'assistant' : 'user', content };
  });
}

/* --------------------------------- calls --------------------------------- */

/**
 * Stream a completion.
 * @returns {Promise<string>} the full assistant text
 */
export async function streamChat({ settings, system, messages, images = [], onDelta = () => {}, signal }) {
  const { preset, baseUrl } = resolveProvider(settings);
  const model = resolveModel(settings, preset);
  const temperature = Number(settings.temperature ?? 0.7);
  const maxTokens = Number(settings.maxTokens ?? 900);
  const key = (settings.apiKey || '').trim();

  if (preset.requiresKey !== false && preset.kind !== 'local' && !key) {
    throw new ProviderError(`No API key set for ${preset.label}. Open Settings → AI engine, or switch to the Local Core.`, 0);
  }

  // Attach images to the final user message when the provider supports vision.
  const payloadMessages = messages.map((m) => ({ ...m }));
  if (images.length && payloadMessages.length) {
    const last = payloadMessages[payloadMessages.length - 1];
    if (!preset.vision) {
      last.content = `${typeof last.content === 'string' ? last.content : ''}\n\n[${images.length} image(s) attached, but the selected model may not support vision.]`;
    } else {
      const text = typeof last.content === 'string' ? last.content : '';
      last.content = [
        { type: 'text', text: text || 'Describe and analyse the attached image(s).' },
        ...images.map((url) => ({ type: 'image_url', image_url: { url } }))
      ];
    }
  }

  let res;
  let extract;

  if (preset.kind === 'openai') {
    res = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      signal,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${key}`,
        ...(settings.provider === 'openrouter' ? { 'HTTP-Referer': location.origin, 'X-Title': 'JARVIS AI' } : {})
      },
      body: JSON.stringify({ model, messages: toOpenAIMessages(system, payloadMessages), temperature, max_tokens: maxTokens, stream: true })
    });
    if (!res.ok) throw await readError(res);
    extract = (j) => j?.choices?.[0]?.delta?.content || j?.choices?.[0]?.message?.content || '';
  } else if (preset.kind === 'gemini') {
    const url = `${baseUrl}/models/${encodeURIComponent(model)}:streamGenerateContent?alt=sse&key=${encodeURIComponent(key)}`;
    res = await fetch(url, {
      method: 'POST',
      signal,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: system }] },
        contents: toGeminiContents(payloadMessages),
        generationConfig: { temperature, maxOutputTokens: maxTokens }
      })
    });
    if (!res.ok) throw await readError(res);
    extract = (j) => (j?.candidates?.[0]?.content?.parts || []).map((p) => p.text || '').join('');
  } else if (preset.kind === 'anthropic') {
    res = await fetch(`${baseUrl}/messages`, {
      method: 'POST',
      signal,
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': key,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true'
      },
      body: JSON.stringify({ model, system, messages: toAnthropicMessages(payloadMessages), max_tokens: maxTokens, temperature, stream: true })
    });
    if (!res.ok) throw await readError(res);
    extract = (j) => (j?.type === 'content_block_delta' ? j?.delta?.text || '' : '');
  } else {
    throw new ProviderError('Unsupported provider kind.', 0);
  }

  let full = '';
  for await (const piece of sseDeltas(res, extract)) {
    full += piece;
    onDelta(piece);
  }
  return full;
}

/** Non-streaming ping used by “Test connection”. */
export async function testConnection(settings, { prompt = 'Reply with exactly: JARVIS online.' } = {}) {
  const started = performance.now();
  let text = '';
  text = await streamChat({
    settings,
    system: 'You are a connection test. Answer with at most six words.',
    messages: [{ role: 'user', content: prompt }],
    onDelta: () => {}
  });
  return { text: text.trim(), ms: Math.round(performance.now() - started) };
}
