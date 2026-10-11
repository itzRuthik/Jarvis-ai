/**
 * brain.js — the orchestrator.
 *
 * Routes a turn to either the offline Local Core or a configured cloud provider,
 * runs the lightweight tool protocol ([[search: …]], [[remember: …]], …), and
 * keeps the conversation history coherent.
 */

import { APP, PROVIDERS } from './config.js';
import { getSettings, memoryFacts, getNotes, getTasks, rememberFact, forgetFact, addTask, addNote, toggleTask } from './store.js';
import { localAnswer } from './local-core.js';
import { streamChat } from './providers.js';
import { search, searchToText, searchToMarkdown } from './search.js';
import { sha256, utilities, readTelemetry } from './tools.js';
import { toPlainText } from './util.js';

export const TOOL_TAGS = ['search', 'remember', 'forget', 'task', 'note', 'calc'];

/** System prompt enriched with live memory, local data and date context. */
export function buildSystemPrompt(settings = getSettings()) {
  const facts = memoryFacts();
  const tasks = getTasks().filter((t) => !t.done);
  const notes = getNotes();
  const now = new Date();

  const context = [
    `CURRENT DATE/TIME: ${now.toString()} (${Intl.DateTimeFormat().resolvedOptions().timeZone})`,
    `PLATFORM: ${navigator.userAgent.includes('Android') ? 'Android' : 'web browser'} · online: ${navigator.onLine ? 'yes' : 'no'}`,
    facts.length
      ? `REMEMBERED FACTS ABOUT THE OPERATOR:\n${facts.map((f) => `- ${f.key}: ${f.value}`).join('\n')}`
      : 'REMEMBERED FACTS ABOUT THE OPERATOR: none yet.',
    tasks.length
      ? `OPEN TASKS (${tasks.length}):\n${tasks.slice(0, 10).map((t) => `- [${t.priority}] ${t.title}`).join('\n')}`
      : 'OPEN TASKS: none.',
    notes.length ? `NOTES: ${notes.slice(0, 8).map((n) => n.title).join(' · ')}` : 'NOTES: none.'
  ].join('\n\n');

  return `${settings.systemPrompt || ''}\n\n---\nLIVE CONTEXT\n${context}`;
}

/** Strip tool tags from text that will be shown or spoken. */
export function stripToolTags(text = '') {
  return String(text).replace(/\[\[(search|remember|forget|task|note|calc):[^\]]*\]\]/gi, '').replace(/\n{3,}/g, '\n\n').trim();
}

/** Parse the tool tags out of a completed assistant message. */
export function parseToolCalls(text = '') {
  const calls = [];
  const re = /\[\[(search|remember|forget|task|note|calc):\s*([^\]]+?)\]\]/gi;
  let match;
  while ((match = re.exec(text)) !== null) {
    calls.push({ tool: match[1].toLowerCase(), arg: match[2].trim() });
  }
  return calls;
}

/** Execute one tool call and return { summary, note, markdown }. */
export async function executeTool(call) {
  const { tool, arg } = call;
  switch (tool) {
    case 'search': {
      const result = await search(arg);
      return { summary: `Searched the web for “${arg}”`, markdown: searchToMarkdown(result), note: searchToText(result) };
    }
    case 'remember': {
      const [key, ...rest] = arg.split(/\s*(?:=|:)\s*/);
      const value = rest.join(' ').trim() || key;
      rememberFact(key, value);
      return { summary: `Remembered ${key}`, markdown: `Stored: **${key}** → ${value}`, note: `Stored fact ${key} = ${value}` };
    }
    case 'forget': {
      const ok = forgetFact(arg);
      return { summary: `Forgot ${arg}`, markdown: ok ? `Deleted **${arg}**.` : `No entry called **${arg}**.`, note: `${ok ? 'Deleted' : 'Missing'} memory key ${arg}` };
    }
    case 'task': {
      const saved = addTask(arg);
      return { summary: `Added task ${saved.title}`, markdown: `Task added: **${saved.title}**`, note: `Task created: ${saved.title}` };
    }
    case 'note': {
      const [title, ...rest] = arg.split(/\s*=\s*/);
      const saved = addNote(title, rest.join(' = '));
      return { summary: `Saved note ${saved.title}`, markdown: `Note saved: **${saved.title}**`, note: `Note created: ${saved.title}` };
    }
    case 'calc': {
      const { calculator, formatNumber } = await import('./tools.js');
      try {
        const out = calculator(arg);
        return { summary: `Evaluated ${arg}`, markdown: `\`${arg}\` = **${out.display}**`, note: `${arg} = ${out.display}`, value: formatNumber(out.value) };
      } catch (err) {
        return { summary: `Calculator failed`, markdown: `Calculator error: ${err.message}`, note: `Calculator error: ${err.message}` };
      }
    }
    default:
      return { summary: 'Unknown tool', markdown: '', note: 'Unknown tool request.' };
  }
}

/**
 * Streamed generation with incremental tool-tag detection.
 * Text inside a `[[…]]` span is withheld until the span closes.
 */
async function streamWithToolCapture({ settings, system, messages, images, onDelta, signal }) {
  let hold = '';
  let visible = '';
  const calls = [];

  const flush = (text, force = false) => {
    hold += text;
    let guard = 0;
    while (guard += 1, guard < 500) {
      const start = hold.indexOf('[[');
      if (start === -1) {
        const keep = hold.endsWith('[') ? 1 : 0;
        visible += hold.slice(0, hold.length - keep);
        if (visible) onDelta(hold.slice(0, hold.length - keep));
        hold = hold.slice(hold.length - keep);
        return;
      }
      const end = hold.indexOf(']]', start + 2);
      if (end === -1) {
        const before = hold.slice(0, start);
        if (before) { visible += before; onDelta(before); }
        hold = hold.slice(start);
        if (hold.length > 220 || force) { // not a tool tag after all — release it
          visible += hold; onDelta(hold); hold = '';
        }
        return;
      }
      const before = hold.slice(0, start);
      if (before) { visible += before; onDelta(before); }
      const tag = hold.slice(start, end + 2);
      const inner = tag.slice(2, -2);
      const match = inner.match(/^\s*(search|remember|forget|task|note|calc)\s*:\s*([\s\S]+)$/i);
      if (match) calls.push({ tool: match[1].toLowerCase(), arg: match[2].trim() });
      else { visible += tag; onDelta(tag); }
      hold = hold.slice(end + 2);
    }
  };

  const full = await streamChat({
    settings,
    system,
    messages,
    images,
    signal,
    onDelta: (chunk) => flush(chunk)
  });
  flush('', true);
  if (hold) { visible += hold; onDelta(hold); hold = ''; }
  return { text: visible || stripToolTags(full), raw: full, calls };
}

/** Offline turn: local core + its deterministic tools. */
async function localTurn({ text, onDelta, onToolNote }) {
  const settings = getSettings();
  const answer = localAnswer(text, { wakeWord: settings.wakeWord });
  const tools = [];

  if (answer.tool === 'search' || /^__SEARCH__/.test(answer.text)) {
    const query = answer.text.replace(/^__SEARCH__/, '');
    onToolNote?.(`Searching for “${query}”…`);
    try {
      const result = await search(query);
      tools.push({ tool: 'search', summary: `Searched “${query}”` });
      const md = searchToMarkdown(result);
      onDelta(md);
      return { text: md, tools };
    } catch (err) {
      const md = `Search unavailable: ${err.message}`;
      onDelta(md);
      return { text: md, tools, error: true };
    }
  }

  if (answer.tool === 'status' || answer.text === '__SYSTEM_REPORT__') {
    const md = await systemReport();
    onDelta(md);
    return { text: md, tools: [{ tool: 'status', summary: 'System report' }] };
  }

  if (answer.tool === 'sha256' && answer.data?.text) {
    const digest = await sha256(answer.data.text);
    const md = `\`SHA-256("${answer.data.text.slice(0, 60)}")\`\n\n\`\`\`\n${digest}\n\`\`\``;
    onDelta(md);
    return { text: md, tools: [{ tool: 'sha256', summary: 'Computed SHA-256' }] };
  }

  if (answer.effects?.includes('completeTask') && answer.data?.id) {
    toggleTask(answer.data.id);
  }

  if (answer.text) {
    // Emit progressively so the HUD feels alive even offline.
    const chunks = answer.text.match(/[\s\S]{1,48}/g) || [answer.text];
    for (const chunk of chunks) {
      onDelta(chunk);
      await new Promise((r) => setTimeout(r, 12));
    }
  }
  return { text: answer.text, tools };
}

/**
 * Run one full conversation turn.
 * @returns {Promise<{text: string, tools: Array, offline?: boolean}>}
 */
export async function runTurn({ text, images = [], history = [], onDelta = () => {}, onToolNote = () => {}, signal }) {
  const settings = getSettings();
  const preset = PROVIDERS[settings.provider] || PROVIDERS.local;

  if (preset.kind === 'local') {
    const out = await localTurn({ text, onDelta, onToolNote });
    return { ...out, offline: true };
  }

  const system = buildSystemPrompt(settings);
  const messages = [...history.map((m) => ({ role: m.role, content: m.content })), { role: 'user', content: text }];
  const allTools = [];
  let lastText = '';

  for (let round = 0; round < 3; round += 1) {
    const { text: visible, calls } = await streamWithToolCapture({
      settings,
      system,
      messages,
      images: round === 0 ? images : [],
      onDelta,
      signal
    });
    lastText = visible;

    if (!calls.length) return { text: visible, tools: allTools };

    const notes = [];
    for (const call of calls) {
      onToolNote?.(`Running ${call.tool}: ${call.arg.slice(0, 60)}`);
      try {
        const result = await executeTool(call);
        allTools.push({ tool: call.tool, summary: result.summary });
        notes.push(`- ${call.tool}(${call.arg}) →\n${result.note}`);
      } catch (err) {
        notes.push(`- ${call.tool}(${call.arg}) FAILED: ${err.message}`);
      }
    }

    messages.push({ role: 'assistant', content: visible || '(used a tool)' });
    messages.push({ role: 'user', content: `[TOOL RESULTS — internal, do not repeat verbatim]\n${notes.join('\n')}\n\nContinue your reply to the operator, using these results. Do not emit more tool tags unless strictly required.` });
  }

  return { text: lastText, tools: allTools };
}

/** Human-readable diagnostics used by the status report command. */
export async function systemReport() {
  const settings = getSettings();
  const preset = PROVIDERS[settings.provider] || PROVIDERS.local;
  const tel = await readTelemetry();
  const tasks = getTasks();
  const facts = memoryFacts();
  const now = utilities.now();
  const support = {
    speech: 'SpeechRecognition' in window || 'webkitSpeechRecognition' in window ? 'available' : 'unsupported',
    tts: 'speechSynthesis' in window ? 'available' : 'unsupported',
    serviceWorker: 'serviceWorker' in navigator ? 'available' : 'unsupported',
    shell: document.documentElement.dataset.shell === 'android'
      ? 'Android app (Capacitor WebView)'
      : (matchMedia('(display-mode: standalone)').matches ? 'installed PWA' : 'browser tab')
  };

  return [
    '**JARVIS system report**',
    '',
    `- **Build** — ${APP.name} v${APP.version}`,
    `- **Engine** — ${preset.label}${preset.kind === 'local' ? ' (offline)' : ` · model \`${settings.model || preset.defaultModel}\``}`,
    `- **Network** — ${tel.online ? `online (${tel.connection})` : 'offline'} · search via ${settings.searchProvider}`,
    `- **Clock** — ${now.date}, ${now.time} (${now.timezone})`,
    `- **Voice** — recognition ${support.speech}, synthesis ${support.tts}, mode “${settings.voiceMode}”`,
    `- **PWA** — service worker ${support.serviceWorker} · running as ${support.shell}`,
    `- **Battery** — ${tel.battery ? `${tel.battery.level}%${tel.battery.charging ? ' charging' : ''}` : 'not exposed by this browser'}`,
    `- **Local data** — ${facts.length} memory fact(s), ${tasks.filter((t) => !t.done).length} open task(s), ${getNotes().length} note(s)`,
    `- **Integrity** — all diagnostics are read-only; no data left this device.`
  ].join('\n');
}

/** Title helper for transcripts and exports. */
export const turnTitle = (text = '') => toPlainText(text).slice(0, 60) || 'Session';
