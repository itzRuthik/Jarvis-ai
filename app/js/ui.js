/**
 * ui.js — HUD wiring: chat, tools, memory, settings, voice and telemetry.
 */

import {
  APP, PROVIDERS, SEARCH_PROVIDERS, STATES, SUGGESTIONS, QUICK_COMMANDS, UTILITY_COMMANDS, DATA_COMMANDS, DEFAULT_SYSTEM_PROMPT
} from './config.js';
import {
  getSettings, saveSettings, resetSettings, memoryFacts, rememberFact, forgetFact, clearMemory,
  getNotes, addNote, deleteNote, getTasks, addTask, toggleTask, deleteTask, clearCompletedTasks,
  getHistory, pushHistory, clearHistory, setHistory, exportAll, importAll, wipeAll, storageFootprint
} from './store.js';
import { calculator, unitCatalogue, convert, utilities, formatNumber, readTelemetry, randomPassword } from './tools.js';
import { voice, voiceSupport, shouldSpeak } from './voice.js';
import { runTurn, systemReport } from './brain.js';
import { Reactor } from './core-canvas.js';
import { ingestFile, attachmentsToPrompt } from './docs.js';
import {
  $, $$, el, renderMarkdown, toPlainText, fmtClock, fmtTime, toast, download, beep, clamp, bytes, escapeHtml
} from './util.js';

const state = {
  busy: false,
  abort: null,
  attachments: [],
  history: [],
  turns: 0,
  lastLatency: null,
  handsFree: false,
  wake: false,
  listening: false,
  installPrompt: null,
  reactor: null,
  speaking: false
};

/* ============================== HUD status ============================== */

function setState(name = 'idle', note = '') {
  document.body.dataset.state = name;
  const chip = $('#chipState');
  const label = $('#chipStateText');
  const info = STATES[name] || STATES.idle;
  label.textContent = note || info.label;
  chip.classList.toggle('is-busy', name === 'thinking' || name === 'listening' || name === 'speaking');
  chip.classList.toggle('is-bad', name === 'error');
  $('#coreStateLabel').textContent = note || info.label;
  $('#coreCaption').textContent = info.caption;
  state.reactor?.setState(name);
}

function currentProviderLabel() {
  const settings = getSettings();
  const preset = PROVIDERS[settings.provider] || PROVIDERS.local;
  if (preset.kind === 'local') return 'LOCAL CORE';
  const model = settings.model || preset.defaultModel || '';
  const short = preset.label.split(/[(—]/)[0].trim().toUpperCase();
  return model ? `${short}` : short;
}

function refreshChips() {
  const settings = getSettings();
  const net = $('#chipNet');
  const online = navigator.onLine;
  net.classList.toggle('is-on', online);
  net.classList.toggle('is-bad', !online);
  net.querySelector('span').textContent = online ? (navigator.connection?.effectiveType?.toUpperCase() || 'ONLINE') : 'OFFLINE';

  const preset = PROVIDERS[settings.provider] || PROVIDERS.local;
  const chip = $('#chipProvider');
  chip.querySelector('span').textContent = currentProviderLabel();
  chip.classList.toggle('is-on', preset.kind !== 'local');
  chip.classList.toggle('is-bad', preset.kind !== 'local' && !settings.apiKey && settings.provider !== 'custom');
  chip.title = preset.kind === 'local'
    ? 'Offline local core — no key required'
    : `${preset.label}${settings.model ? ` · ${settings.model}` : ''}`;
}

function startClock() {
  const tick = () => { $('#chipClock').textContent = fmtClock(); };
  tick();
  setInterval(tick, 1000);
}

async function refreshTelemetry() {
  const settings = getSettings();
  const preset = PROVIDERS[settings.provider] || PROVIDERS.local;
  $('#tmMode').textContent = preset.kind === 'local' ? 'LOCAL' : 'CLOUD';
  $('#tmModel').textContent = preset.kind === 'local' ? 'rule-core' : (settings.model || preset.defaultModel || '—');
  $('#tmLatency').textContent = state.lastLatency ? `${state.lastLatency} ms` : '—';
  $('#tmTurns').textContent = String(state.turns);
  $('#tmMemory').textContent = String(memoryFacts().length);
  $('#tmAudio').textContent = state.listening ? `${Math.round(voice.getLevel() * 100)}%` : '—';
  const tel = await readTelemetry();
  $('#tmBattery').textContent = tel.battery ? `${tel.battery.level}%${tel.battery.charging ? '⚡' : ''}` : '—';
}

/* ================================= chat ================================= */

function messageNode({ role, text, meta = '', html = false }) {
  const who = role === 'user' ? 'OPERATOR' : role === 'system' ? 'SYSTEM' : 'JARVIS';
  const avatar = role === 'user' ? 'OP' : role === 'system' ? '!!' : 'AI';
  const node = el('div', { class: `msg msg--${role}` }, [
    el('div', { class: 'msg__avatar', text: avatar }),
    el('div', { class: 'msg__body' }, [
      el('div', { class: 'msg__name', text: who }),
      el('div', { class: 'msg__text', html: html ? text : renderMarkdown(text) }),
      meta ? el('div', { class: 'msg__meta', text: meta }) : null
    ])
  ]);
  return node;
}

function appendMessage(message) {
  const log = $('#log');
  const node = messageNode(message);
  if (message.id) node.dataset.id = message.id;
  log.append(node);
  log.scrollTop = log.scrollHeight;
  return node;
}

function typingNode(label = 'processing') {
  const node = el('div', { class: 'msg msg--assistant msg--typing' }, [
    el('div', { class: 'msg__avatar', text: 'AI' }),
    el('div', { class: 'msg__body' }, [
      el('div', { class: 'msg__name', text: 'JARVIS' }),
      el('div', { class: 'msg__text', html: '<span class="msg__typing"><span></span><span></span><span></span></span>' }),
      el('div', { class: 'msg__meta', text: label })
    ])
  ]);
  $('#log').append(node);
  $('#log').scrollTop = $('#log').scrollHeight;
  return node;
}

function setGreeting() {
  const settings = getSettings();
  const preset = PROVIDERS[settings.provider] || PROVIDERS.local;
  const offline = preset.kind === 'local';
  appendMessage({
    role: 'assistant',
    text: [
      `**${APP.name} online.** ${APP.tagline}`,
      '',
      offline
        ? 'Running the **offline Local Core**: maths, conversions, notes, tasks, memory and utilities are fully available. Connect a cloud engine in **Setup** for open-ended conversation.'
        : `Engine: **${preset.label}** · model \`${settings.model || preset.defaultModel}\`.`,
      '',
      'Try the suggestion chips below, or press **Ctrl/⌘ + K** to jump to the command line.'
    ].join('\n')
  });
  renderSuggestions();
}

function renderSuggestions() {
  const host = $('#suggestions');
  const memory = memoryFacts();
  const items = [...SUGGESTIONS];
  if (memory.length) items[3] = `What do you remember about me?`;
  host.innerHTML = '';
  items.slice(0, 6).forEach((text) => {
    host.append(el('button', { class: 'suggestion', type: 'button', text, onclick: () => submit(text) }));
  });
}

function historyForProvider() {
  return getHistory()
    .filter((m) => m.role === 'user' || m.role === 'assistant')
    .slice(-12)
    .map((m) => ({ role: m.role, content: m.content }));
}

/* ============================== turn handling ============================== */

async function submit(forcedText = null, attachmentsOverride = null) {
  const input = $('#input');
  const raw = (forcedText ?? input.value).trim();
  const attachments = attachmentsOverride || state.attachments;
  if ((!raw && !attachments.length) || state.busy) return;

  const settings = getSettings();
  const docText = attachmentsToPrompt(attachments);
  const displayText = raw || (attachments.length ? `Analyse the attached ${attachments.length > 1 ? 'files' : 'file'}.` : '');
  const promptText = docText ? `${displayText}\n\n${docText}` : displayText;

  input.value = '';
  autosize();
  state.attachments = [];
  renderAttachments();

  pushHistory({ role: 'user', content: promptText, ts: Date.now() });
  appendMessage({ role: 'user', text: displayText, meta: attachments.length ? `${attachments.length} attachment(s) · ${fmtTime(Date.now())}` : fmtTime(Date.now()) });
  renderSuggestions();

  const pending = typingNode('contacting engine…');
  const started = performance.now();
  state.busy = true;
  state.abort = new AbortController();
  $('#btnStop').hidden = false;
  setState('thinking', 'PROCESSING');
  beep('send', settings.sound);
  voice.cancel();

  const textEl = pending.querySelector('.msg__text');
  const metaEl = pending.querySelector('.msg__meta');
  let streamed = '';
  let firstDelta = true;

  const onDelta = (chunk) => {
    streamed += chunk;
    if (firstDelta) {
      textEl.innerHTML = '';
      firstDelta = false;
    }
    textEl.innerHTML = renderMarkdown(streamed);
    $('#log').scrollTop = $('#log').scrollHeight;
  };

  const onToolNote = (note) => { metaEl.textContent = note; };

  try {
    const result = await runTurn({
      text: promptText,
      images: attachments.filter((a) => a.kind === 'image').map((a) => a.dataUrl),
      history: historyForProvider(),
      onDelta,
      onToolNote,
      signal: state.abort.signal
    });

    const finalText = result.text || streamed || '(no output)';
    textEl.innerHTML = renderMarkdown(finalText);
    const latency = Math.round(performance.now() - started);
    state.lastLatency = latency;
    state.turns += 1;
    metaEl.textContent = [
      fmtTime(Date.now()),
      `${latency} ms`,
      result.offline ? 'local core' : (getSettings().model || 'cloud'),
      ...(result.tools?.length ? result.tools.map((t) => t.summary) : [])
    ].join(' · ');

    pushHistory({ role: 'assistant', content: finalText, ts: Date.now() });
    setState('idle', 'STANDBY');
    beep('recv', getSettings().sound);

    if (shouldSpeak(finalText, settings) && !state.handsFree) speakText(finalText);
    else if (state.handsFree) speakText(finalText, { restartListening: true });

    refreshLists();
    renderSuggestions();
  } catch (err) {
    const aborted = err?.name === 'AbortError';
    pending.remove();
    appendMessage({
      role: aborted ? 'system' : 'error',
      text: aborted ? 'Generation stopped by the operator.' : `**Fault detected.** ${err.message}\n\nCheck **Setup → AI engine**: provider, model, base URL and API key. The offline Local Core keeps working without a key.`,
      meta: fmtTime(Date.now())
    });
    setState(aborted ? 'idle' : 'error', aborted ? 'STANDBY' : 'FAULT');
    if (!aborted) toast(err.message, 'err', 6000);
    if (aborted) pushHistory({ role: 'assistant', content: '_generation stopped_', ts: Date.now() });
  } finally {
    state.busy = false;
    state.abort = null;
    $('#btnStop').hidden = true;
    refreshTelemetry();
    refreshChips();
  }
}

function speakText(text, { restartListening = false } = {}) {
  const settings = getSettings();
  if (!shouldSpeak(text, settings)) {
    if (restartListening) startListening({ auto: true });
    return;
  }
  const plain = toPlainText(text).slice(0, 1200);
  state.speaking = true;
  setState('speaking', 'SPEAKING');
  voice.speak(plain, {
    voiceName: settings.voiceName,
    rate: Number(settings.rate),
    pitch: Number(settings.pitch),
    onStart: () => setState('speaking', 'SPEAKING'),
    onEnd: () => {
      state.speaking = false;
      if (!state.busy) setState('idle', 'STANDBY');
      if (restartListening && state.handsFree) startListening({ auto: true });
    }
  });
}

/* =============================== microphone =============================== */

function startListening({ auto = false } = {}) {
  if (!voiceSupport.recognition) {
    toast('Speech recognition is not supported in this browser. Chrome or Edge on Android/desktop works best.', 'err', 5000);
    return;
  }
  if (state.listening) return;
  voice.cancel();
  state.listening = true;
  $('#btnMic').classList.add('is-live');
  $('#btnMic').setAttribute('aria-pressed', 'true');
  $('#btnListenText').textContent = 'Stop';
  setState('listening', 'LISTENING');
  voice.startMeter();

  voice.startRecognition({
    continuous: state.handsFree || state.wake,
    wakeWords: state.wake ? [getSettings().wakeWord || 'jarvis'] : [],
    onPartial: (text) => { $('#composerHint').textContent = `▍ ${text}`; },
    onFinal: (text) => {
      $('#composerHint').textContent = 'Enter to send · Shift+Enter for a new line';
      if (!auto && !state.handsFree && !state.wake) $('#input').value = text;
      submit(text);
    },
    onEnd: () => {
      state.listening = false;
      voice.stopMeter();
      $('#btnMic').classList.remove('is-live');
      $('#btnMic').setAttribute('aria-pressed', 'false');
      $('#btnListenText').textContent = 'Listen';
      $('#composerHint').textContent = 'Enter to send · Shift+Enter for a new line';
      if (!state.busy && !state.speaking) setState('idle', 'STANDBY');
      if ((state.handsFree || state.wake) && !state.busy && !state.speaking) {
        setTimeout(() => { if ((state.handsFree || state.wake) && !state.listening) startListening({ auto: true }); }, 600);
      }
    },
    onError: (err) => {
      if (!/no speech/i.test(err.message)) toast(err.message, 'err', 5200);
    }
  });
}

function stopListening() {
  state.listening = false;
  voice.stopRecognition();
  voice.stopMeter();
  $('#btnMic').classList.remove('is-live');
  $('#btnMic').setAttribute('aria-pressed', 'false');
  $('#btnListenText').textContent = 'Listen';
  if (!state.busy && !state.speaking) setState('idle', 'STANDBY');
}

/* ============================ composer & files ============================ */

function autosize() {
  const input = $('#input');
  input.style.height = 'auto';
  input.style.height = `${Math.min(140, input.scrollHeight)}px`;
}

function renderAttachments() {
  const host = $('#attachments');
  host.innerHTML = '';
  host.hidden = state.attachments.length === 0;
  state.attachments.forEach((item, index) => {
    const chip = el('span', { class: 'attachment' }, [
      item.preview && item.kind === 'image' ? el('img', { src: item.preview, alt: '' }) : null,
      el('span', { text: `${item.name}${item.preview && item.kind !== 'image' ? ` · ${item.preview}` : ''}` }),
      el('button', { type: 'button', title: 'Remove', text: '✕', onclick: () => { state.attachments.splice(index, 1); renderAttachments(); } })
    ]);
    host.append(chip);
  });
}

async function handleFiles(files) {
  for (const file of Array.from(files).slice(0, 6)) {
    try {
      const item = await ingestFile(file);
      state.attachments.push(item);
      toast(`${file.name} attached`, 'ok', 2000);
    } catch (err) {
      toast(err.message, 'err', 5200);
    }
  }
  renderAttachments();
}

/* ================================= tools ================================= */

function fillConverter() {
  const from = $('#convFrom');
  const to = $('#convTo');
  const catalogue = unitCatalogue();
  from.innerHTML = '';
  to.innerHTML = '';
  catalogue.forEach((u) => {
    from.append(el('option', { value: u.unit, text: u.label }));
    to.append(el('option', { value: u.unit, text: u.label }));
  });
  from.value = 'km';
  to.value = 'mi';
}

function runConversion() {
  const value = $('#convValue').value;
  try {
    const out = convert(value, $('#convFrom').value, $('#convTo').value);
    $('#convOut').textContent = `${formatNumber(Number(value))} ${$('#convFrom').value} = ${formatNumber(Number(out.toFixed(8)))} ${$('#convTo').value}`;
  } catch (err) {
    $('#convOut').textContent = err.message;
  }
}

function renderNotes() {
  const list = $('#notesList');
  const notes = getNotes();
  $('#notesCount').textContent = notes.length ? `· ${notes.length}` : '';
  list.innerHTML = '';
  if (!notes.length) {
    list.append(el('li', {}, [el('span', { class: 'grow dim', text: 'No notes stored.' })]));
    return;
  }
  notes.forEach((note) => {
    list.append(el('li', {}, [
      el('span', { class: 'grow' }, [
        el('strong', { text: note.title }),
        el('span', { class: 'dim', text: note.body ? ` — ${note.body}` : '' })
      ]),
      el('span', { class: 'li-actions' }, [
        el('button', { title: 'Delete note', class: 'del', text: '🗑', onclick: () => { deleteNote(note.id); renderNotes(); toast('Note deleted', 'ok', 1600); } })
      ])
    ]));
  });
}

function renderTasks() {
  const list = $('#tasksList');
  const tasks = getTasks();
  const open = tasks.filter((t) => !t.done).length;
  $('#tasksCount').textContent = tasks.length ? `· ${open} open / ${tasks.length}` : '';
  list.innerHTML = '';
  if (!tasks.length) {
    list.append(el('li', {}, [el('span', { class: 'grow dim', text: 'Task queue is clear.' })]));
    return;
  }
  tasks.slice(0, 60).forEach((task) => {
    list.append(el('li', { class: task.done ? 'done' : '' }, [
      el('input', { type: 'checkbox', checked: task.done, title: 'Toggle', onchange: () => { toggleTask(task.id); renderTasks(); } }),
      el('span', { class: 'grow', text: task.title }),
      task.priority === 'high' ? el('span', { class: 'mono tiny', text: 'HIGH' }) : null,
      el('span', { class: 'li-actions' }, [
        el('button', { title: 'Delete task', class: 'del', text: '🗑', onclick: () => { deleteTask(task.id); renderTasks(); toast('Task deleted', 'ok', 1600); } })
      ])
    ]));
  });
}

function renderMemory() {
  const list = $('#memoryList');
  const facts = memoryFacts();
  list.innerHTML = '';
  if (!facts.length) {
    list.append(el('li', {}, [el('span', { class: 'grow dim', text: 'Memory bank empty — add a fact above, or say “remember my name is …”.' })]));
  }
  facts.forEach((fact) => {
    list.append(el('li', {}, [
      el('span', { class: 'grow' }, [
        el('span', { class: 'kv', text: fact.key }),
        el('span', { text: ` → ${fact.value}` })
      ]),
      el('span', { class: 'li-actions' }, [
        el('button', { title: 'Forget', class: 'del', text: '🗑', onclick: () => { forgetFact(fact.key); renderMemory(); refreshTelemetry(); toast(`Forgot ${fact.key}`, 'ok', 1800); } })
      ])
    ]));
  });
  $('#storageHint').textContent = `Local footprint: ${bytes(storageFootprint())} · transcript limit ${getSettings().historyLimit === 0 ? 'disabled' : `${getSettings().historyLimit} messages`} · nothing is uploaded automatically.`;
}

function refreshLists() {
  renderMemory();
  renderNotes();
  renderTasks();
  refreshTelemetry();
}

async function runUtility(tool) {
  const out = $('#utilOut');
  const settings = getSettings();
  try {
    switch (tool) {
      case 'random': out.textContent = `Random number (1–100): ${utilities.random().value}`; break;
      case 'coin': out.textContent = `Coin toss: ${utilities.coin().result}`; break;
      case 'dice': { const r = utilities.dice('d6', 1); out.textContent = `d${r.sides} → ${r.rolls[0]}`; break; }
      case 'uuid': out.textContent = `UUID: ${utilities.uuid().value}`; break;
      case 'sha256': {
        const text = window.prompt('Text to hash with SHA-256:', 'hello world');
        if (text === null) return;
        out.textContent = 'Computing…';
        out.textContent = `SHA-256("${text.slice(0, 40)}") = ${await utilities.sha256(text).then((r) => r.value)}`;
        break;
      }
      case 'base64enc': {
        const text = window.prompt('Text to encode:', 'JARVIS');
        if (text === null) return;
        out.textContent = `base64: ${utilities.base64enc(text).value}`;
        break;
      }
      case 'base64dec': {
        const text = window.prompt('Base64 to decode:', 'SkFSVklT');
        if (text === null) return;
        out.textContent = `decoded: ${utilities.base64dec(text).value}`;
        break;
      }
      case 'password': out.textContent = `Passphrase (24): ${randomPassword(24)}`; break;
      case 'timer': {
        const seconds = Number(window.prompt('Timer length in seconds:', '60') || 60);
        out.textContent = `Timer armed for ${seconds}s.`;
        setTimeout(() => {
          out.textContent = `⏰ Timer complete (${seconds}s).`;
          toast(`Timer complete — ${seconds}s`, 'ok', 6000);
          beep('recv', settings.sound);
          if (shouldSpeak('Your timer is complete.', settings)) speakText(`Timer of ${seconds} seconds complete.`);
          if (Notification?.permission === 'granted') new Notification('JARVIS timer', { body: `${seconds}s timer complete` });
        }, clamp(seconds, 1, 86400) * 1000);
        break;
      }
      default: out.textContent = 'Unknown utility.';
    }
  } catch (err) {
    out.textContent = `Error: ${err.message}`;
  }
}

function runDataAction(action) {
  switch (action) {
    case 'export':
      download(`jarvis-backup-${new Date().toISOString().slice(0, 10)}.json`, exportAll());
      toast('Backup exported (credentials excluded)', 'ok');
      break;
    case 'import': {
      const input = el('input', { type: 'file', accept: 'application/json' });
      input.onchange = async () => {
        const file = input.files?.[0];
        if (!file) return;
        try {
          importAll(await file.text());
          applySettingsToUI();
          refreshLists();
          toast('Backup imported', 'ok');
        } catch (err) {
          toast(`Import failed: ${err.message}`, 'err');
        }
      };
      input.click();
      break;
    }
    case 'clearHistory':
      clearHistory();
      $('#log').innerHTML = '';
      setGreeting();
      toast('Transcript cleared', 'ok');
      break;
    case 'wipe':
      if (window.confirm('Wipe ALL local data — settings, API key, memory, notes, tasks and transcript?')) {
        wipeAll();
        applySettingsToUI();
        refreshLists();
        $('#log').innerHTML = '';
        setGreeting();
        toast('All local data wiped', 'ok');
      }
      break;
    default: break;
  }
}

/* ================================ settings ================================ */

function applySettingsToUI() {
  const settings = getSettings();
  $('#setProvider').value = settings.provider;
  $('#setApiKey').value = settings.apiKey || '';
  const preset = PROVIDERS[settings.provider] || PROVIDERS.local;
  $('#setModel').value = settings.model || preset.defaultModel || '';
  $('#setBaseUrl').value = settings.baseUrl || preset.baseUrl || '';
  $('#setBaseUrl').placeholder = preset.baseUrl || 'https://your-proxy.example.com/v1';
  $('#setTemp').value = settings.temperature;
  $('#outTemp').textContent = Number(settings.temperature).toFixed(1);
  $('#setMaxTokens').value = settings.maxTokens;
  $('#outMax').textContent = settings.maxTokens;
  $('#setSessionKeyOnly').checked = settings.sessionKeyOnly;
  $('#setSystem').value = settings.systemPrompt;
  $('#setSearchProvider').value = settings.searchProvider;
  $('#setSearchKey').value = settings.searchKey || '';
  $('#setSearchAuto').checked = settings.searchAuto;
  $('#setVoiceMode').value = settings.voiceMode;
  $('#setRate').value = settings.rate;
  $('#outRate').textContent = Number(settings.rate).toFixed(2);
  $('#setPitch').value = settings.pitch;
  $('#outPitch').textContent = Number(settings.pitch).toFixed(2);
  $('#setWakeWord').value = settings.wakeWord;
  $('#setBargeIn').checked = settings.bargeIn;
  $('#setTheme').value = settings.theme;
  $('#setReduceFx').checked = settings.reduceFx;
  $('#setSound').checked = settings.sound;
  $('#setHistoryLimit').value = String(settings.historyLimit);
  $('#aboutVersion').textContent = `${APP.name} v${APP.version} · ${APP.repo}`;
  $('#keyNote').textContent = preset.kind === 'local' ? 'not required for the local core' : `stored only on this device · get one at ${preset.keysUrl || 'your provider'}`;
  document.documentElement.dataset.theme = settings.theme;
  document.body.classList.toggle('reduce-fx', settings.reduceFx || matchMedia('(prefers-reduced-motion: reduce)').matches);
  state.reactor?.setPalette(settings.theme);
  $('#btnMute').setAttribute('aria-pressed', String(settings.voiceMode === 'off'));
  $('#btnMuteText').textContent = settings.voiceMode === 'off' ? 'Voice off' : 'Voice on';
  $('#btnHandsFree').setAttribute('aria-pressed', String(state.handsFree));
  $('#btnWake').setAttribute('aria-pressed', String(state.wake));
  refreshChips();
  populateModelList();
  populateVoices();
}

function populateModelList() {
  const settings = getSettings();
  const preset = PROVIDERS[settings.provider] || PROVIDERS.local;
  const list = $('#modelList');
  list.innerHTML = '';
  (preset.models || []).forEach((model) => list.append(el('option', { value: model })));
}

function populateVoices() {
  const host = $('#setVoice');
  const settings = getSettings();
  host.innerHTML = '';
  const voices = voice.voices();
  if (!voices.length) {
    host.append(el('option', { value: '', text: 'System default' }));
    setTimeout(populateVoices, 700);
    return;
  }
  host.append(el('option', { value: '', text: 'System default' }));
  voices.forEach((v) => host.append(el('option', { value: v.name, text: `${v.name} (${v.lang})` })));
  host.value = settings.voiceName || '';
}

function wireSettings() {
  const provider = $('#setProvider');
  Object.values(PROVIDERS).forEach((p) => provider.append(el('option', { value: p.id, text: p.label })));
  Object.values(SEARCH_PROVIDERS).forEach((p) => $('#setSearchProvider').append(el('option', { value: p.id, text: p.label })));

  provider.onchange = () => {
    const preset = PROVIDERS[provider.value];
    saveSettings({ provider: provider.value, model: preset.defaultModel || '', baseUrl: '', apiKey: provider.value === 'local' ? '' : getSettings().apiKey });
    applySettingsToUI();
    toast(`Engine set to ${preset.label}`, 'ok', 2200);
  };
  $('#setApiKey').onchange = (e) => { saveSettings({ apiKey: e.target.value.trim() }); refreshChips(); toast('API key saved on this device', 'ok', 2200); };
  $('#setModel').onchange = (e) => { saveSettings({ model: e.target.value.trim() }); refreshChips(); refreshTelemetry(); };
  $('#setBaseUrl').onchange = (e) => saveSettings({ baseUrl: e.target.value.trim() });
  $('#setTemp').oninput = (e) => { $('#outTemp').textContent = Number(e.target.value).toFixed(1); saveSettings({ temperature: Number(e.target.value) }); };
  $('#setMaxTokens').oninput = (e) => { $('#outMax').textContent = e.target.value; saveSettings({ maxTokens: Number(e.target.value) }); };
  $('#setSessionKeyOnly').onchange = (e) => {
    saveSettings({ sessionKeyOnly: e.target.checked });
    toast(e.target.checked ? 'Key will not persist after this session' : 'Key will persist on this device', 'ok', 2600);
  };
  $('#setSystem').onchange = (e) => saveSettings({ systemPrompt: e.target.value });
  $('#btnResetSystem').onclick = () => { saveSettings({ systemPrompt: DEFAULT_SYSTEM_PROMPT }); $('#setSystem').value = DEFAULT_SYSTEM_PROMPT; toast('Persona restored', 'ok'); };
  $('#setSearchProvider').onchange = (e) => saveSettings({ searchProvider: e.target.value });
  $('#setSearchKey').onchange = (e) => saveSettings({ searchKey: e.target.value.trim() });
  $('#setSearchAuto').onchange = (e) => saveSettings({ searchAuto: e.target.checked });
  $('#setVoiceMode').onchange = (e) => { saveSettings({ voiceMode: e.target.value }); applySettingsToUI(); };
  $('#setVoice').onchange = (e) => saveSettings({ voiceName: e.target.value });
  $('#setRate').oninput = (e) => { $('#outRate').textContent = Number(e.target.value).toFixed(2); saveSettings({ rate: Number(e.target.value) }); };
  $('#setPitch').oninput = (e) => { $('#outPitch').textContent = Number(e.target.value).toFixed(2); saveSettings({ pitch: Number(e.target.value) }); };
  $('#setWakeWord').onchange = (e) => saveSettings({ wakeWord: e.target.value.trim() || 'jarvis' });
  $('#setBargeIn').onchange = (e) => saveSettings({ bargeIn: e.target.checked });
  $('#setTheme').onchange = (e) => { saveSettings({ theme: e.target.value }); applySettingsToUI(); };
  $('#setReduceFx').onchange = (e) => { saveSettings({ reduceFx: e.target.checked }); applySettingsToUI(); };
  $('#setSound').onchange = (e) => saveSettings({ sound: e.target.checked });
  $('#setHistoryLimit').onchange = (e) => { saveSettings({ historyLimit: Number(e.target.value) }); renderMemory(); };
  $('#btnExportSettings').onclick = () => {
    const s = { ...getSettings(), apiKey: '' };
    download('jarvis-settings.json', JSON.stringify(s, null, 2));
    toast('Settings exported (key excluded)', 'ok');
  };
  $('#btnImportSettings').onclick = () => {
    const input = el('input', { type: 'file', accept: 'application/json' });
    input.onchange = async () => {
      try {
        const data = JSON.parse(await input.files[0].text());
        saveSettings({ ...data, apiKey: getSettings().apiKey });
        applySettingsToUI();
        toast('Settings imported', 'ok');
      } catch (err) { toast(`Import failed: ${err.message}`, 'err'); }
    };
    input.click();
  };
  $('#btnTest').onclick = async () => {
    const out = $('#testOut');
    out.textContent = 'Testing…';
    try {
      const { testConnection } = await import('./providers.js');
      const result = await testConnection(getSettings());
      out.textContent = `✔ ${result.ms} ms — “${result.text.slice(0, 120)}”`;
      toast('Connection successful', 'ok');
      setState('idle', 'STANDBY');
    } catch (err) {
      out.textContent = `✘ ${err.message}`;
      toast('Connection test failed', 'err', 6000);
    }
  };
}

function openDrawer() {
  $('#drawer').hidden = false;
  $('#drawer').querySelector('.drawer__body').focus?.();
}
function closeDrawer() { $('#drawer').hidden = true; }

/* ================================= panels ================================= */

function gotoView(view) {
  if (view === 'settings') { openDrawer(); return; }
  document.body.dataset.view = view;
  $$('.tabbar button').forEach((b) => b.classList.toggle('is-active', b.dataset.goto === view));
  if (view === 'core') state.reactor?.resize();
}

/* ================================== init ================================== */

export function initUI() {
  state.reactor = new Reactor($('#core'));
  state.reactor.setPalette(getSettings().theme);
  state.reactor.start();
  window.addEventListener('resize', () => state.reactor?.resize());
  state.reactor.onFps = (fps) => { $('#tmFps').textContent = `${Math.round(fps)} fps`; };

  // boot sequence
  const log = $('#bootLog');
  const lines = [
    '> JARVIS OS v' + APP.version,
    '> reactor ......... ONLINE',
    '> holographic HUD . CALIBRATED',
    '> local core ...... ARMED',
    '> memory bank ..... MOUNTED',
    '> voice subsystem . ' + (voiceSupport.recognition ? 'READY' : 'UNAVAILABLE'),
    '> ' + APP.tagline
  ];
  let i = 0;
  const step = () => {
    if (i >= lines.length) {
      setTimeout(() => $('#boot').classList.add('is-done'), 420);
      return;
    }
    log.textContent += `${lines[i]}\n`;
    i += 1;
    setTimeout(step, 190);
  };
  step();
  setTimeout(() => $('#boot').classList.add('is-done'), 4000);
  $('#boot').onclick = () => $('#boot').classList.add('is-done');

  // base wiring
  startClock();
  wireSettings();
  applySettingsToUI();
  fillConverter();
  refreshLists();
  setGreeting();
  setState('idle', 'STANDBY');
  refreshChips();
  refreshTelemetry();
  setInterval(refreshTelemetry, 2500);
  window.addEventListener('online', () => { refreshChips(); toast('Network restored — cloud engines available', 'ok'); });
  window.addEventListener('offline', () => { refreshChips(); toast('Offline — local core still operational', 'info'); });

  // suggestions + quick commands
  SUGGESTIONS.forEach(() => {});
  const quick = $('#quickCommands');
  QUICK_COMMANDS.forEach((cmd) => quick.append(el('button', {
    class: 'btn btn--ghost',
    type: 'button',
    text: cmd.label,
    onclick: () => {
      if (cmd.prompt) return submit(cmd.prompt);
      if (cmd.tool === 'tasks') return submit('show tasks');
      if (cmd.tool === 'notes') return submit('show notes');
      if (cmd.tool === 'memory') return submit('what do you remember?');
      if (cmd.tool === 'netcheck') {
        return appendMessage({ role: 'system', text: navigator.onLine ? `Network up (${navigator.connection?.effectiveType || 'unknown'}). Cloud engines reachable.` : 'No network. The Local Core keeps working offline.' });
      }
      if (cmd.tool === 'time') return submit('what time is it?');
      return runUtility(cmd.tool);
    }
  })));
  const util = $('#utilityCommands');
  UTILITY_COMMANDS.forEach((cmd) => util.append(el('button', { class: 'btn btn--ghost', type: 'button', text: cmd.label, onclick: () => runUtility(cmd.tool) })));
  const dataCmds = $('#dataCommands');
  DATA_COMMANDS.forEach((cmd) => dataCmds.append(el('button', {
    class: `btn ${cmd.action === 'wipe' ? 'btn--danger' : 'btn--ghost'}`,
    type: 'button',
    text: cmd.label,
    onclick: () => runDataAction(cmd.action)
  })));
  $('#btnMemAddHelp').onclick = () => appendMessage({
    role: 'system',
    text: 'Memory stores durable facts locally (`key → value`). The assistant injects them into the system prompt on every cloud request and reads them in offline replies. Export a backup before switching devices; wipe at any time from Data controls.'
  });

  // composer
  const input = $('#input');
  input.addEventListener('input', autosize);
  input.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      submit();
    }
  });
  $('#composer').addEventListener('submit', (event) => { event.preventDefault(); submit(); });
  $('#btnAttach').onclick = () => $('#fileInput').click();
  $('#fileInput').onchange = async (event) => { await handleFiles(event.target.files); event.target.value = ''; };
  $('#btnStop').onclick = () => { state.abort?.abort(); voice.cancel(); };
  $('#btnNewChat').onclick = () => {
    clearHistory();
    $('#log').innerHTML = '';
    state.turns = 0;
    setGreeting();
    toast('New session started', 'ok');
  };
  $('#btnExport').onclick = () => {
    const lines = getHistory().map((m) => `[${new Date(m.ts).toISOString()}] ${m.role.toUpperCase()}: ${m.content}`);
    download(`jarvis-transcript-${Date.now()}.txt`, lines.join('\n\n') || 'Empty session', 'text/plain');
  };
  $('#btnMic').onclick = () => (state.listening ? stopListening() : startListening());
  $('#btnListen').onclick = () => (state.listening ? stopListening() : startListening());
  $('#btnMute').onclick = () => {
    const settings = getSettings();
    const next = settings.voiceMode === 'off' ? 'auto' : 'off';
    saveSettings({ voiceMode: next });
    if (next === 'off') voice.cancel();
    applySettingsToUI();
    toast(next === 'off' ? 'Spoken replies muted' : 'Spoken replies on', 'ok', 1800);
  };
  $('#btnSettings').onclick = openDrawer;
  $$('[data-close]').forEach((node) => { node.onclick = closeDrawer; });
  $$('.tabbar button').forEach((btn) => { btn.onclick = () => gotoView(btn.dataset.goto); });
  $('#btnHandsFree').onclick = () => {
    state.handsFree = !state.handsFree;
    saveSettings({ handsFree: state.handsFree });
    $('#btnHandsFree').setAttribute('aria-pressed', String(state.handsFree));
    toast(state.handsFree ? 'Hands-free mode engaged — I will keep listening' : 'Hands-free mode disengaged', 'ok', 2400);
    if (state.handsFree) startListening({ auto: true }); else stopListening();
  };
  $('#btnWake').onclick = () => {
    state.wake = !state.wake;
    $('#btnWake').setAttribute('aria-pressed', String(state.wake));
    if (state.wake) {
      toast(`Wake word armed (“${getSettings().wakeWord}”). Say it to summon me.`, 'ok', 3400);
      startListening({ auto: true });
    } else {
      toast('Wake word disarmed', 'info', 1800);
      if (!state.handsFree) stopListening();
    }
  };

  // tools
  $('#calcRun').onclick = () => {
    const expr = $('#calcInput').value;
    try {
      const out = calculator(expr);
      $('#calcOut').textContent = `${out.expression} = ${out.display}`;
      beep('ping', getSettings().sound);
    } catch (err) { $('#calcOut').textContent = `Error: ${err.message}`; }
  };
  $('#calcInput').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('#calcRun').click(); });
  ['#convValue', '#convFrom', '#convTo'].forEach((sel) => { $(sel).addEventListener('input', runConversion); $(sel).addEventListener('change', runConversion); });
  $('#noteAdd').onclick = () => {
    const title = $('#noteTitle').value.trim();
    if (!title) return toast('Give the note a title', 'err', 2000);
    addNote(title, $('#noteBody').value.trim());
    $('#noteTitle').value = '';
    $('#noteBody').value = '';
    renderNotes();
    toast('Note saved', 'ok', 1800);
  };
  $('#taskAdd').onclick = () => {
    const title = $('#taskTitle').value.trim();
    if (!title) return toast('Give the task a title', 'err', 2000);
    addTask(title, $('#taskPriority').value);
    $('#taskTitle').value = '';
    renderTasks();
    toast('Task added', 'ok', 1800);
  };
  $('#taskTitle').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('#taskAdd').click(); });
  $('#noteBody').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('#noteAdd').click(); });
  $('#memAdd').onclick = () => {
    const key = $('#memKey').value.trim();
    const value = $('#memValue').value.trim();
    if (!key || !value) return toast('Both key and value are required', 'err', 2200);
    rememberFact(key, value);
    $('#memKey').value = '';
    $('#memValue').value = '';
    renderMemory();
    refreshTelemetry();
    toast('Stored in memory bank', 'ok', 1800);
  };
  $('#memValue').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('#memAdd').click(); });

  // voice support summary + voice list loading
  $('#voiceSupport').textContent = [
    `Recognition: ${voiceSupport.recognition ? 'available' : 'not available in this browser'}`,
    `Synthesis: ${voiceSupport.synthesis ? 'available' : 'not available'}`,
    `Microphone: ${voiceSupport.mic ? 'available' : 'not available'}`
  ].join(' · ');
  if (voiceSupport.synthesis) window.speechSynthesis?.addEventListener?.('voiceschanged', populateVoices);
  populateVoices();

  // keyboard shortcuts
  document.addEventListener('keydown', (event) => {
    const meta = event.ctrlKey || event.metaKey;
    if (meta && event.key.toLowerCase() === 'k') { event.preventDefault(); gotoView('chat'); input.focus(); }
    if (event.key === 'Escape') {
      if (!$('#drawer').hidden) closeDrawer();
      else if (state.busy) { state.abort?.abort(); }
      else if (state.listening) stopListening();
      else if (state.speaking) { voice.cancel(); state.speaking = false; setState('idle', 'STANDBY'); }
    }
    if (meta && event.key.toLowerCase() === 'm') { event.preventDefault(); $('#btnMic').click(); }
    if (event.code === 'Space' && event.altKey) { event.preventDefault(); voice.cancel(); state.speaking = false; setState('idle', 'STANDBY'); }
  });

  // barge-in: stop speaking when the operator types or speaks
  input.addEventListener('keydown', () => {
    if (getSettings().bargeIn && state.speaking) { voice.cancel(); state.speaking = false; setState('idle', 'STANDBY'); }
  });

  // PWA install affordance
  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    state.installPrompt = event;
    const btn = el('button', {
      class: 'iconbtn',
      title: 'Install JARVIS as an app',
      html: '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path fill="currentColor" d="M12 3v10.6l3.3-3.3 1.4 1.4L12 17.4 7.3 12.7l1.4-1.4 3.3 3.2V3h0ZM5 19h14v2H5v-2Z"/></svg>',
      onclick: async () => {
        if (!state.installPrompt) return;
        state.installPrompt.prompt();
        const choice = await state.installPrompt.userChoice;
        toast(choice.outcome === 'accepted' ? 'Installing JARVIS…' : 'Install dismissed', choice.outcome === 'accepted' ? 'ok' : 'info');
        state.installPrompt = null;
        btn.remove();
      }
    });
    $('.topbar__actions').prepend(btn);
    toast('JARVIS can be installed as an app — tap the ⬇ icon', 'info', 6000);
  });
  window.addEventListener('appinstalled', () => { toast('JARVIS installed', 'ok'); });

  // drag & drop attachments
  ['dragover', 'drop'].forEach((type) => document.addEventListener(type, (event) => {
    if (type === 'dragover') { event.preventDefault(); return; }
    event.preventDefault();
    if (event.dataTransfer?.files?.length) handleFiles(event.dataTransfer.files);
  }));

  // welcome status toast
  setTimeout(() => {
    const settings = getSettings();
    if (settings.provider === 'local') toast('Offline core active · add a key in Setup for cloud AI', 'info', 6000);
  }, 3000);

  // expose a tiny console API for power users
  window.JARVIS = {
    version: APP.version,
    systemReport,
    export: exportAll,
    wipe: wipeAll,
    setProvider: (id) => saveSettings({ provider: id }),
    ask: (text) => submit(text),
    state
  };
}

export { state as uiState, submit, setState };
