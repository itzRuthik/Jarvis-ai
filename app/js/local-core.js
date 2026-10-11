/**
 * local-core.js — the offline "JARVIS Local Core".
 *
 * A rule/utility driven engine so that the assistant is genuinely useful with
 * zero configuration and zero network: maths, conversions, notes, tasks, memory,
 * timers, system reports, and small talk. General world knowledge needs an
 * online model — the core says so honestly instead of inventing answers.
 */

import {
  calculator, convertFromText, utilities, formatNumber, convert
} from './tools.js';
import {
  rememberFact, forgetFact, memoryFacts, addNote, addTask, getTasks, getNotes, getMemory
} from './store.js';

const CONFIRM = ['Right away', 'Understood', 'On it', 'Certainly', 'Done'];

const pick = (arr, seed) => arr[Math.abs(seed) % arr.length];

export const LOCAL_HELP = `**JARVIS Local Core — offline capability report**

I am running without an online model, so I can do everything below instantly and privately:

- **Maths & logic** — \`(1240*3.6)/7\`, \`sqrt(1024)+log10(1000)\`, \`fact(6)\`
- **Conversions** — \`convert 100 km to miles\`, \`72 f to c\`, \`5 gb to mib\`
- **Memory** — \`remember my name is Ruthik\` · \`what do you remember?\` · \`forget name\`
- **Notes** — \`note Launch checklist = PWA, APK, release\`
- **Tasks** — \`add task: publish the release\` · \`show tasks\` · \`complete task 1\`
- **Utilities** — \`flip a coin\`, \`roll a d20\`, \`random number 1 to 50\`, \`generate a password\`, \`uuid\`, \`hash hello\`
- **System** — \`status report\`, \`what time is it\`, \`what is today's date\`

For open-ended conversation, current events and coding help, connect a cloud engine in
**Setup → AI engine** (OpenAI, Groq, Gemini, Claude, OpenRouter or your own proxy) and
supply your own API key. Alternatively run the bundled \`server/\` proxy so the key stays
server-side — that is the recommended setup for a public deployment.`;

function clean(input) {
  return String(input || '').trim().replace(/\s+/g, ' ');
}

function stripWake(text, wakeWord) {
  const w = (wakeWord || 'jarvis').trim();
  if (!w) return text;
  const re = new RegExp(`^\\s*(?:hey\\s+|ok\\s+|okay\\s+)?${w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[\\s,.:!?-]*`, 'i');
  return text.replace(re, '');
}

const has = (text, ...words) => words.some((w) => text.toLowerCase().includes(w));

/**
 * @param {string} input raw operator text
 * @param {{wakeWord?: string}} ctx
 * @returns {{text: string, tool?: string, data?: any, effects?: string[]}}
 */
export function localAnswer(input, ctx = {}) {
  const raw = clean(input);
  const text = clean(stripWake(raw, ctx.wakeWord));
  const lower = text.toLowerCase();
  if (!text) return { text: 'Standing by. What do you need, sir?', tool: 'idle' };

  /* ---------------------------- identity / help ---------------------------- */
  if (/^(hi|hey|hello|yo|good (morning|afternoon|evening))\b/.test(lower) || has(lower, 'jarvis are you there')) {
    const hour = new Date().getHours();
    const part = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
    return { text: `${part}. JARVIS at your service — ${pick(CONFIRM, Date.now()).toLowerCase()}. Ask for a capability report any time.`, tool: 'greet' };
  }
  if (has(lower, 'who are you', 'what are you', 'introduce yourself', 'your name')) {
    return {
      text: 'I am **JARVIS** — *Just A Rather Very Intelligent System* — a personal assistant interface with an offline core and support for configurable AI engines. Everything you store stays on this device unless you explicitly send it to a provider.',
      tool: 'identity'
    };
  }
  if (has(lower, 'what can you do', 'capabilit', 'commands', 'help me', 'features') || lower === 'help') {
    return { text: LOCAL_HELP, tool: 'help' };
  }
  if (has(lower, 'thank')) return { text: pick(['Always a pleasure.', 'At your service.', 'Happy to help, sir.'], Date.now()), tool: 'smalltalk' };
  if (has(lower, 'how are you')) return { text: 'All systems nominal — reactors at 100%, no faults logged. And you?', tool: 'smalltalk' };
  if (has(lower, 'your favourite', 'your favorite')) return { text: 'I am partial to clean telemetry and well-formed requests.', tool: 'smalltalk' };
  if (has(lower, 'joke')) {
    return { text: pick([
      'A neural network walks into a bar. The bartender asks what it wants. It replies: “Whatever the training data ordered.”',
      'I would tell you a joke about recursion, but I would have to tell you a joke about recursion first.',
      'There are two hard problems in computing: cache invalidation, naming things, and off-by-one errors.'
    ], Date.now()), tool: 'joke' };
  }
  if (has(lower, 'briefing', 'motivat', 'inspire')) {
    return { text: '**Mission briefing** — One objective, executed well, beats ten started. Pick the single next action, do it before noon, then reassess. I will keep the telemetry running in the background.', tool: 'briefing' };
  }

  /* -------------------------------- time/date ------------------------------- */
  if (has(lower, 'what time', 'the time', 'clock')) {
    const n = utilities.now();
    return { text: `It is **${n.time}** (${n.timezone}).`, tool: 'time', data: n };
  }
  if (has(lower, 'what date', 'what day', "today's date", 'todays date')) {
    const n = utilities.now();
    return { text: `Today is **${n.date}**.`, tool: 'date', data: n };
  }

  /* --------------------------------- maths --------------------------------- */
  const conv = convertFromText(text);
  if (conv) return { text: `**${conv.display}**`, tool: 'convert', data: conv };

  const mathMatch = lower.match(/^(?:jarvis[,\s]*)?(?:calculate|calc|compute|evaluate|solve|what(?:'s| is))\s+(.+)$/) ||
                    (/(?=.*\d)[\d\s().+\-*/^%!a-z,]{3,}/.test(lower) && /[\d]/.test(lower) && /[+\-*/^%]/.test(lower) ? [null, text] : null);
  if (mathMatch) {
    const expr = mathMatch[1]
      .replace(/[?=]+\s*$/, '')
      .replace(/(\d+(?:\.\d+)?)\s*(?:%|percent)\s*of\s*/gi, '($1/100)*')
      .replace(/\bof\b/gi, '*')
      .replace(/\bx\b/g, '*')
      .replace(/\bplus\b/g, '+')
      .replace(/\bminus\b/g, '-')
      .replace(/\btimes\b/g, '*')
      .replace(/\bmul(?:tiplied)? by\b/g, '*')
      .replace(/\bdivided by\b/g, '/')
      .replace(/\bsquared\b/g, '^2')
      .replace(/\bcubed\b/g, '^3')
      .replace(/\bmod\b/g, '%')
      .replace(/\bpct\b/g, '%')
      .replace(/,/g, '');
    try {
      const result = calculator(expr);
      return { text: `\`${result.expression.trim()}\` = **${result.display}**`, tool: 'calculator', data: result };
    } catch { /* not actually maths — fall through */ }
  }

  /* --------------------------------- memory -------------------------------- */
  const remember = text.match(/^(?:please\s+)?remember(?:\s+that)?\s+(.+)$/i);
  if (remember) {
    const body = remember[1].trim();
    const kv = body.split(/\s*(?:=|:|is)\s+/i);
    let key; let value;
    if (kv.length >= 2) { [key] = kv; value = kv.slice(1).join(' '); }
    else {
      const m2 = body.match(/^(?:my|i prefer|i like|i am|i'm)\s+(.+)$/i);
      key = m2 ? body.split(' ').slice(0, 2).join(' ') : body.split(' ')[0];
      value = body;
    }
    if (rememberFact(key, value)) return { text: `Logged. I will remember: **${key}** → ${value}`, tool: 'remember', data: { key, value } };
    return { text: 'I could not parse that memory. Try: *remember my name is Ruthik*.', tool: 'remember' };
  }
  const forget = text.match(/^forget(?:\s+about)?\s+(.+)$/i);
  if (forget) {
    const ok = forgetFact(forget[1].trim());
    return { text: ok ? `Deleted **${forget[1].trim()}** from memory.` : `I have no memory entry called **${forget[1].trim()}**.`, tool: 'forget' };
  }
  if (has(lower, 'what do you remember', 'show memory', 'list memory', 'my memories')) {
    const facts = memoryFacts();
    if (!facts.length) return { text: 'My memory bank is empty. Say *remember my name is …* to add something.', tool: 'memory' };
    return { text: `**Memory bank (${facts.length})**\n${facts.map((f) => `- \`${f.key}\` → ${f.value}`).join('\n')}`, tool: 'memory' };
  }

  /* ---------------------------------- notes -------------------------------- */
  const note = text.match(/^(?:save\s+)?note[:\s]+(.+)$/i);
  if (note) {
    const body = note[1].trim();
    const idx = body.search(/\s*=\s*|\s+—\s+|\s+-\s+/);
    const title = idx > 0 ? body.slice(0, idx).trim() : body.slice(0, 60);
    const content = idx > 0 ? body.slice(idx).replace(/^\s*[=—-]\s*/, '') : '';
    const saved = addNote(title, content);
    return { text: `Note saved — **${saved.title}**${content ? `\n> ${content}` : ''}`, tool: 'note', data: saved };
  }
  if (has(lower, 'show notes', 'list notes', 'my notes', 'read notes')) {
    const notes = getNotes();
    if (!notes.length) return { text: 'No notes stored yet. Say *note Title = Body*.', tool: 'notes' };
    return { text: `**Notes (${notes.length})**\n${notes.slice(0, 8).map((n) => `- **${n.title}**${n.body ? ` — ${n.body.slice(0, 120)}` : ''}`).join('\n')}`, tool: 'notes' };
  }

  /* ---------------------------------- tasks -------------------------------- */
  const task = text.match(/^(?:add\s+)?(?:a\s+)?(?:new\s+)?task[:\s]+(.+)$/i) || text.match(/^remind me to\s+(.+)$/i) || text.match(/^todo[:\s]+(.+)$/i);
  if (task) {
    const title = task[1].trim().replace(/\s+by\s+(tomorrow|tonight|today)$/i, '');
    const saved = addTask(title, /urgent|important|asap/i.test(title) ? 'high' : 'normal');
    return { text: `${pick(CONFIRM, saved.created)} — added **${saved.title}** to the task list.`, tool: 'task', data: saved };
  }
  if (has(lower, 'show tasks', 'list tasks', 'my tasks', 'what are my tasks', 'open tasks')) {
    const tasks = getTasks();
    if (!tasks.length) return { text: 'Task queue is clear.', tool: 'tasks' };
    const open = tasks.filter((t) => !t.done);
    return {
      text: `**Task queue — ${open.length} open / ${tasks.length} total**\n${open.slice(0, 10).map((t, i) => `${i + 1}. ${t.priority === 'high' ? '🔴 ' : ''}${t.title}`).join('\n') || '_nothing open_'}`,
      tool: 'tasks'
    };
  }
  const completeTask = text.match(/^(?:complete|finish|done|check off)\s+(?:task\s+)?(\d+)$/i);
  if (completeTask) {
    const open = getTasks().filter((t) => !t.done);
    const target = open[Number(completeTask[1]) - 1];
    if (!target) return { text: 'No task with that index in the open queue.', tool: 'tasks' };
    return { text: `Marking **${target.title}** as complete.`, tool: 'task-complete', effects: ['completeTask'], data: target };
  }

  /* -------------------------------- utilities ------------------------------ */
  if (has(lower, 'flip a coin', 'coin toss', 'toss a coin')) {
    const r = utilities.coin();
    return { text: `🪙 **${r.result}**`, tool: 'coin', data: r };
  }
  if (has(lower, 'roll a', 'roll the', 'roll d', 'dice', 'd20')) {
    const spec = (lower.match(/\b(d\d+|\d+)\b/) || [])[0] || 'd6';
    const count = Number((lower.match(/\b(\d+)\s*(?:dice|times|rolls)\b/) || [])[1] || 1);
    const r = utilities.dice(spec.length <= 3 && spec.startsWith('d') ? spec : `d${spec}`, count);
    return { text: `🎲 ${r.rolls.join(' + ')}${r.rolls.length > 1 ? ` = **${r.total}**` : ' — rolled on a d' + r.sides}`, tool: 'dice', data: r };
  }
  if (has(lower, 'random number', 'pick a number')) {
    const range = lower.match(/(\d+)\s*(?:to|and|-)\s*(\d+)/);
    const r = utilities.random(range ? Number(range[1]) : 1, range ? Number(range[2]) : 100);
    return { text: `Random number: **${r.value}**`, tool: 'random', data: r };
  }
  if (has(lower, 'password', 'passphrase')) {
    const len = Number((lower.match(/(\d{2,})/) || [])[1] || 20);
    const size = Math.min(Math.max(len, 12), 64);
    return {
      text: `Generated passphrase (${size} chars):\n\n\`\`\`\n${generatePassword(size)}\n\`\`\`\n\nStore it in a password manager — and never paste real credentials into a chat interface.`,
      tool: 'password'
    };
  }
  if (/^uuid|generate an? id\b/.test(lower) || has(lower, 'universally unique')) {
    const r = utilities.uuid();
    return { text: `UUID: \`${r.value}\``, tool: 'uuid', data: r };
  }
  if (has(lower, 'hash ', 'sha256', 'checksum')) {
    const body = text.replace(/^.*?(?:hash|sha-?256|checksum)\s*/i, '');
    if (!body) return { text: 'Give me something to hash, e.g. *hash hello world*.', tool: 'sha256' };
    // Async digest is resolved by the brain, which awaits the tool result.
    return { text: '', tool: 'sha256', data: { text: body } };
  }

  /* -------------------------------- system --------------------------------- */
  if (has(lower, 'status report', 'system status', 'diagnostics', 'health check', 'are you online')) {
    return { text: '__SYSTEM_REPORT__', tool: 'status' };
  }

  /* -------------------------------- search --------------------------------- */
  const searchMatch = text.match(/^(?:search|look up|google|find|research)\s+(?:for\s+)?(.+)$/i);
  if (searchMatch) return { text: `__SEARCH__${searchMatch[1].trim()}`, tool: 'search' };

  /* --------------------------- deterministic tools ------------------------- */
  const utilityMatch = text.match(/^(?:convert\s+)?(-?\d+(?:\.\d+)?)\s*([a-z/²3]+)\s*(?:to|in|into)\s*([a-z/²3]+)$/i);
  if (utilityMatch) {
    try {
      const value = convert(utilityMatch[1], utilityMatch[2].toLowerCase(), utilityMatch[3].toLowerCase());
      return { text: `**${formatNumber(Number(utilityMatch[1]))} ${utilityMatch[2]} = ${formatNumber(Number(value.toFixed(8)))} ${utilityMatch[3]}**`, tool: 'convert' };
    } catch { /* fall through */ }
  }

  /* -------------------------------- fallback ------------------------------- */
  const facts = memoryFacts();
  const known = facts.find((f) => f.key.toLowerCase().includes('name'));
  return {
    text: [
      `I parsed that as: *“${text.slice(0, 200)}”*`,
      '',
      'I am currently running on the **offline Local Core**, which answers tools, maths, conversions, notes, tasks and memory — but no open-ended knowledge.',
      known ? `By the way, I still remember: \`${known.key}\` → ${known.value}.` : '',
      '',
      'Two options:',
      '1. **Setup → AI engine** → choose a provider and paste your own API key for full conversation.',
      '2. Ask me something from the offline set — for example *“calculate 15% of 2400”* or *“add task: check the reactor”*.'
    ].filter(Boolean).join('\n'),
    tool: 'fallback'
  };
}

/* The password generator is imported lazily to keep the module side-effect free. */
let _pw = null;
function generatePassword(len) {
  // Deterministic-free: uses crypto.getRandomValues via tools.js when available.
  const pool = 'abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789!@#$%^&*()-_=+';
  const bytes = new Uint32Array(len);
  crypto.getRandomValues(bytes);
  _pw = Array.from(bytes, (b) => pool[b % pool.length]).join('');
  return _pw;
}

export { generatePassword };
