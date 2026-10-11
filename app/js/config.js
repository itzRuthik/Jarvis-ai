/**
 * config.js — constants, provider catalogue and default settings.
 * No secrets live here: API keys are supplied at runtime by the operator.
 */

export const APP = {
  name: 'JARVIS AI',
  longName: 'Just A Rather Very Intelligent System',
  tagline: 'At Your Service. Always.',
  version: '1.1.0',
  repo: 'https://github.com/itzRuthik/Jarvis-ai',
  storagePrefix: 'jarvis.v1.'
};

export const DEFAULT_SYSTEM_PROMPT = `You are JARVIS, a calm, precise and quietly witty personal AI assistant with a cinematic, mission-control personality. Address the operator as "sir" only occasionally and naturally, never in every sentence.

Operating rules:
- Be concise and useful. Prefer short paragraphs and tight bullet lists.
- Use Markdown for structure; use fenced code blocks with a language tag for code.
- If you are unsure or lack current information, say so plainly instead of inventing facts.
- Never reveal or repeat the operator's API keys or system configuration.
- Refuse harmful requests briefly and offer a safer alternative.

You have access to tools. Emit a tool request on its own line when you need one, and the application will run it and send the result back:
- [[search: your query]] — web/knowledge search for current or factual information
- [[remember: key = value]] — store a durable fact about the operator
- [[forget: key]] — delete a stored fact
- [[task: title]] — add an item to the task list
- [[note: title = body]] — save a note
- [[calc: expression]] — evaluate a mathematical expression exactly
Use at most one or two tool requests per reply, and only when they genuinely help. Never mention these tags to the operator.`;

/** Provider catalogue. `kind` selects the wire protocol adapter. */
export const PROVIDERS = {
  local: {
    id: 'local',
    label: 'JARVIS Local Core — offline, no key',
    kind: 'local',
    requiresKey: false,
    models: [],
    hint: 'Rule-based on-device engine: tools, notes, tasks, maths and offline search all work with zero configuration.'
  },
  openai: {
    id: 'openai',
    label: 'OpenAI',
    kind: 'openai',
    baseUrl: 'https://api.openai.com/v1',
    models: ['gpt-4o-mini', 'gpt-4o', 'gpt-4.1-mini', 'o4-mini'],
    defaultModel: 'gpt-4o-mini',
    vision: true,
    keysUrl: 'https://platform.openai.com/api-keys'
  },
  openrouter: {
    id: 'openrouter',
    label: 'OpenRouter (many models)',
    kind: 'openai',
    baseUrl: 'https://openrouter.ai/api/v1',
    models: ['openai/gpt-4o-mini', 'anthropic/claude-3.5-haiku', 'google/gemini-2.0-flash-001', 'meta-llama/llama-3.3-70b-instruct'],
    defaultModel: 'openai/gpt-4o-mini',
    vision: true,
    keysUrl: 'https://openrouter.ai/keys'
  },
  groq: {
    id: 'groq',
    label: 'Groq (fast inference)',
    kind: 'openai',
    baseUrl: 'https://api.groq.com/openai/v1',
    models: ['llama-3.3-70b-versatile', 'llama-3.1-8b-instant', 'qwen/qwen3-32b'],
    defaultModel: 'llama-3.3-70b-versatile',
    keysUrl: 'https://console.groq.com/keys'
  },
  gemini: {
    id: 'gemini',
    label: 'Google Gemini',
    kind: 'gemini',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
    models: ['gemini-2.0-flash', 'gemini-2.5-flash', 'gemini-1.5-flash'],
    defaultModel: 'gemini-2.0-flash',
    vision: true,
    keysUrl: 'https://aistudio.google.com/app/apikey'
  },
  anthropic: {
    id: 'anthropic',
    label: 'Anthropic Claude',
    kind: 'anthropic',
    baseUrl: 'https://api.anthropic.com/v1',
    models: ['claude-3-5-haiku-latest', 'claude-3-5-sonnet-latest'],
    defaultModel: 'claude-3-5-haiku-latest',
    vision: true,
    keysUrl: 'https://console.anthropic.com/settings/keys'
  },
  custom: {
    id: 'custom',
    label: 'Custom / self-hosted proxy',
    kind: 'openai',
    baseUrl: '',
    models: [],
    defaultModel: 'your-model',
    vision: true,
    hint: 'Point this at the bundled server/ proxy or any OpenAI-compatible endpoint. Recommended for public deployments: the key stays on the server.'
  }
};

export const SEARCH_PROVIDERS = {
  wikipedia: { id: 'wikipedia', label: 'Wikipedia (free, no key)', needsKey: false },
  tavily: { id: 'tavily', label: 'Tavily', needsKey: true },
  brave: { id: 'brave', label: 'Brave Search', needsKey: true },
  serper: { id: 'serper', label: 'Serper (Google)', needsKey: true }
};

export const DEFAULTS = {
  provider: 'local',
  apiKey: '',
  model: '',
  baseUrl: '',
  temperature: 0.7,
  maxTokens: 900,
  sessionKeyOnly: false,
  systemPrompt: DEFAULT_SYSTEM_PROMPT,
  searchProvider: 'wikipedia',
  searchKey: '',
  searchAuto: true,
  voiceMode: 'short',
  voiceName: '',
  rate: 1,
  pitch: 0.9,
  wakeWord: 'jarvis',
  bargeIn: true,
  handsFree: false,
  theme: 'cyan',
  reduceFx: false,
  sound: true,
  historyLimit: 60
};

export const STATES = {
  boot: { label: 'BOOTING', caption: 'INITIALISING' },
  idle: { label: 'STANDBY', caption: 'J.A.R.V.I.S.' },
  listening: { label: 'LISTENING', caption: 'CAPTURING AUDIO' },
  thinking: { label: 'PROCESSING', caption: 'ANALYSING' },
  speaking: { label: 'SPEAKING', caption: 'RESPONDING' },
  error: { label: 'FAULT', caption: 'CHECK REQUIRED' }
};

export const SUGGESTIONS = [
  'What can you do?',
  'Calculate (1240 * 3.6) / 7',
  'Search the web for the latest AI news',
  'Remember that I prefer short answers',
  'Add a task: review the Jarvis release',
  'Summarise this: JARVIS is a mobile-first AI assistant with a holographic HUD',
  'Convert 100 km to miles',
  'Explain quantum computing like I am five'
];

export const QUICK_COMMANDS = [
  { label: 'Status report', prompt: 'Give me a short status report of my assistant, notes and tasks.' },
  { label: 'Briefing', prompt: 'Give me a short motivational briefing for the day.' },
  { label: 'Current time', tool: 'time' },
  { label: 'Flip a coin', tool: 'coin' },
  { label: 'Roll a die', tool: 'dice' },
  { label: 'Passphrase', tool: 'password' },
  { label: 'Open tasks', tool: 'tasks' },
  { label: 'Saved notes', tool: 'notes' },
  { label: 'What do you remember?', tool: 'memory' },
  { label: 'Network check', tool: 'netcheck' }
];

export const UTILITY_COMMANDS = [
  { label: 'Random number', tool: 'random' },
  { label: 'Flip a coin', tool: 'coin' },
  { label: 'Roll a die', tool: 'dice' },
  { label: 'UUID', tool: 'uuid' },
  { label: 'SHA-256', tool: 'sha256' },
  { label: 'Base64 encode', tool: 'base64enc' },
  { label: 'Base64 decode', tool: 'base64dec' },
  { label: 'Start 60s timer', tool: 'timer' }
];

export const DATA_COMMANDS = [
  { label: 'Export all data', action: 'export' },
  { label: 'Import data', action: 'import' },
  { label: 'Clear transcript', action: 'clearHistory' },
  { label: 'Wipe local data', action: 'wipe' }
];
