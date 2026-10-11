/**
 * search.js — web search adapters.
 * Wikipedia works with no key at all; Tavily / Brave / Serper use a key the
 * operator supplies in Settings. Results are normalised to {title, url, snippet}.
 */

import { getSettings } from './store.js';

const json = async (res) => {
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Search failed (${res.status}). ${body.slice(0, 180)}`);
  }
  return res.json();
};

async function wikipedia(query, limit = 5) {
  const url = `https://en.wikipedia.org/w/api.php?action=query&format=json&origin=*&list=search&srlimit=${limit}&srsearch=${encodeURIComponent(query)}`;
  const data = await json(await fetch(url));
  const hits = data?.query?.search || [];
  const results = hits.map((h) => ({
    title: h.title,
    url: `https://en.wikipedia.org/wiki/${encodeURIComponent(h.title.replace(/\s/g, '_'))}`,
    snippet: String(h.snippet || '').replace(/<[^>]+>/g, '')
  }));
  let answer = '';
  if (hits[0]) {
    try {
      const summary = await json(await fetch(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(hits[0].title.replace(/\s/g, '_'))}`));
      answer = summary?.extract || '';
    } catch { /* summary is optional */ }
  }
  return { provider: 'wikipedia', query, answer, results };
}

async function tavily(query, key, limit = 5) {
  const res = await fetch('https://api.tavily.com/search', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ api_key: key, query, max_results: limit, include_answer: true, search_depth: 'basic' })
  });
  const data = await json(res);
  return {
    provider: 'tavily',
    query,
    answer: data.answer || '',
    results: (data.results || []).map((r) => ({ title: r.title, url: r.url, snippet: r.content }))
  };
}

async function brave(query, key, limit = 5) {
  const res = await fetch(`https://api.search.brave.com/res/v1/web/search?count=${limit}&q=${encodeURIComponent(query)}`, {
    headers: { Accept: 'application/json', 'X-Subscription-Token': key }
  });
  const data = await json(res);
  return {
    provider: 'brave',
    query,
    answer: data?.web?.results?.[0]?.description || '',
    results: (data?.web?.results || []).map((r) => ({ title: r.title, url: r.url, snippet: r.description }))
  };
}

async function serper(query, key, limit = 5) {
  const res = await fetch('https://google.serper.dev/search', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-API-KEY': key },
    body: JSON.stringify({ q: query, num: limit })
  });
  const data = await json(res);
  return {
    provider: 'serper',
    query,
    answer: data?.answerBox?.answer || data?.answerBox?.snippet || data?.knowledgeGraph?.description || '',
    results: (data.organic || []).slice(0, limit).map((r) => ({ title: r.title, url: r.link, snippet: r.snippet }))
  };
}

/** Run a search with the configured provider; falls back to Wikipedia when a key is missing. */
export async function search(query, override = {}) {
  const settings = getSettings();
  const provider = override.provider || settings.searchProvider || 'wikipedia';
  const key = override.key ?? settings.searchKey;
  const clean = String(query || '').trim();
  if (!clean) throw new Error('Nothing to search for');

  try {
    switch (provider) {
      case 'tavily':
        if (!key) throw new Error('Tavily needs an API key in Settings → Web search');
        return await tavily(clean, key);
      case 'brave':
        if (!key) throw new Error('Brave Search needs an API key in Settings → Web search');
        return await brave(clean, key);
      case 'serper':
        if (!key) throw new Error('Serper needs an API key in Settings → Web search');
        return await serper(clean, key);
      default:
        return await wikipedia(clean);
    }
  } catch (err) {
    if (provider !== 'wikipedia') {
      try {
        const fallback = await wikipedia(clean);
        fallback.results.unshift({ title: 'Note', url: '', snippet: `${err.message} — fell back to Wikipedia.` });
        return fallback;
      } catch { /* fall through to the original error */ }
    }
    throw err;
  }
}

/** Compact text block handed to the language model as tool output. */
export function searchToText(result) {
  const lines = [`WEB SEARCH (${result.provider}) for "${result.query}"`];
  if (result.answer) lines.push(`Answer: ${result.answer}`);
  result.results.slice(0, 5).forEach((r, i) => {
    lines.push(`${i + 1}. ${r.title} — ${r.snippet}${r.url ? ` (${r.url})` : ''}`);
  });
  if (lines.length === 1) lines.push('No results found.');
  return lines.join('\n');
}

/** Markdown answer used when the offline core performs a search. */
export function searchToMarkdown(result) {
  const out = [`**Web results — ${result.provider}** · query: \`${result.query}\``];
  if (result.answer) out.push('', result.answer);
  if (result.results?.length) {
    out.push('');
    result.results.slice(0, 5).forEach((r) => {
      out.push(`- ${r.url ? `[${r.title}](${r.url})` : r.title} — ${String(r.snippet || '').slice(0, 240)}`);
    });
  } else {
    out.push('', 'No results found.');
  }
  return out.join('\n');
}
