/**
 * website.js — content for the JARVIS AI marketing site.
 * Rendering the feature / roadmap / FAQ content from data keeps the HTML honest
 * and makes it trivial to keep in sync with the app.
 */

const FEATURES = [
  {
    icon: '🔵',
    title: 'Futuristic HUD',
    body: 'An Iron-Man-inspired holographic interface with layered glass panels, scanlines, a live grid and glowing telemetry — all original, all CSS.',
    tags: ['works offline', 'canvas + css']
  },
  {
    icon: '🧠',
    title: 'AI intelligence',
    body: 'Conversational AI with configurable model integrations: OpenAI, Groq, OpenRouter, Google Gemini, Anthropic Claude, or your own OpenAI-compatible proxy.',
    tags: ['6 engines', 'needs your key']
  },
  {
    icon: '🎙️',
    title: 'Voice assistant',
    body: 'Speech recognition and spoken responses through the Web Speech APIs, with a reactive microphone level meter driving the core animation.',
    tags: ['Chrome / Edge', 'needs permission']
  },
  {
    icon: '⚡',
    title: 'Animated AI core',
    body: 'Nested rotating rings, a scanner sweep, a particle field, a pulsing nucleus and a waveform that reacts to your voice in real time.',
    tags: ['60 fps', 'reduced-motion aware']
  },
  {
    icon: '🌐',
    title: 'Web search',
    body: 'Online information retrieval through Wikipedia (free, no key needed) or Tavily, Brave Search and Serper when you supply a key.',
    tags: ['4 providers', 'auto-search']
  },
  {
    icon: '💾',
    title: 'Smart memory',
    body: 'User-controlled facts and preferences stored locally, injected into the prompt so the assistant actually remembers you — and deletable in one tap.',
    tags: ['local only', 'exportable']
  },
  {
    icon: '🛠️',
    title: 'AI tools',
    body: 'Calculator with a purpose-built parser, unit converter, notes, task management, code assistance, hashes, dice, passwords and timers.',
    tags: ['fully offline', 'no eval']
  },
  {
    icon: '👁️',
    title: 'Image analysis',
    body: 'Attach or drop an image and send it to a vision-capable model for description, OCR-style reading and analysis.',
    tags: ['needs vision model', 'stays local until sent']
  },
  {
    icon: '📄',
    title: 'Document analysis',
    body: 'Summarise and analyse text files, code, CSV, JSON and PDFs using a built-in best-effort PDF text extractor.',
    tags: ['PDF + text', '120k chars']
  },
  {
    icon: '📱',
    title: 'Mobile-first design',
    body: 'Thumb-friendly composer, bottom navigation, safe-area padding and a responsive grid that becomes a mission-control dashboard on desktop.',
    tags: ['Android optimised', 'touch targets']
  },
  {
    icon: '🌙',
    title: 'Offline mode',
    body: 'The app shell is cached, and the Local Core answers maths, conversions, notes, tasks, memory, utilities and diagnostics with no network at all.',
    tags: ['zero config', 'instant']
  },
  {
    icon: '📦',
    title: 'PWA support',
    body: 'Installable on Android and desktop with a service worker, app shortcuts, maskable icons and standalone fullscreen launch.',
    tags: ['installable', 'home screen']
  },
  {
    icon: '🔐',
    title: 'Security by design',
    body: 'No credentials in the repo or the bundle, a strict Content-Security-Policy, session-only key mode, and an optional server proxy that keeps keys server-side.',
    tags: ['CSP', 'BYOK', 'proxy option']
  },
  {
    icon: '🤖',
    title: 'Android APK',
    body: 'A Capacitor Android project ships in the repository, and GitHub Actions builds an APK on every push so you can sideload it directly.',
    tags: ['CI built', 'sideload']
  }
];

const ROADMAP = [
  ['Build the cinematic JARVIS interface', true],
  ['Implement the animated AI core', true],
  ['Create a responsive mobile dashboard', true],
  ['Develop the chat interface', true],
  ['Integrate configurable AI providers', true],
  ['Implement voice input and output', true],
  ['Add web search', true],
  ['Build the user-controlled memory system', true],
  ['Add calculator, notes and task management', true],
  ['Integrate image and document analysis', true],
  ['Implement offline functionality and the Local Core', true],
  ['Configure PWA installation', true],
  ['Prepare Android packaging and CI APK builds', true],
  ['Test security and performance', 'partly'],
  ['Publish deployment instructions', true],
  ['Server-side streaming proxy for public deployments', 'next'],
  ['Supabase-backed sync and accounts', 'next'],
  ['Wake-word engine improvements and barge-in tuning', 'next'],
  ['Play Store release track (signed AAB)', 'next']
];

const FAQ = [
  ['Do I need an API key to use JARVIS?',
    'No. The offline Local Core runs with zero configuration and handles maths, conversions, notes, tasks, memory, utilities, timers and system diagnostics. A key from a provider of your choice unlocks open-ended conversation, image understanding and document reasoning.'],
  ['Where is my API key stored?',
    'In your own browser (localStorage) on your device, or only in memory if you enable “Keep API key for this session only”. Nothing is sent to us — there is no backend unless you deploy one. The trickier truth: a direct browser-to-provider call exposes the key to anyone using that browser profile, so the project recommends a disposable key with a spend limit, or the bundled server proxy.'],
  ['Is this an official Iron Man or Marvel product?',
    'No. JARVIS AI is an independent, fan-made project inspired by science-fiction aesthetics. The interface, code and wording are original and the project is not affiliated with, endorsed by or derived from those properties.'],
  ['Why is speech recognition sometimes unavailable?',
    'It relies on the browser Web Speech API, which requires HTTPS, a microphone permission, and browser support — Chrome and Edge on desktop and Android are the most reliable. Firefox and some in-app browsers do not implement it, so the app falls back to typing and still speaks replies where synthesis is available.'],
  ['Can this run on GitHub Pages even though there is a server folder?',
    'Yes. The web app, the PWA and this website are fully static, so GitHub Pages serves them. The optional server proxy is a separate Node process for people who want to hide their key; it is documented and git-ignored, not required.'],
  ['How does the Android APK get built?',
    'A GitHub Actions workflow runs on every push to main: it verifies the app shell, runs the test suite, builds a Capacitor Android project and uploads a debug APK to a release. You can also build locally with ./gradlew assembleDebug inside the android folder.'],
  ['Is my conversation history uploaded anywhere?',
    'Only the messages you send are transmitted — and only to the provider you configured. Transcripts, memory, notes and tasks live in local storage and can be exported, cleared or wiped at any time from the Memory panel.']
];

function renderFeatures() {
  const host = document.getElementById('featureCards');
  FEATURES.forEach((f) => {
    const card = document.createElement('article');
    card.className = 'card';
    card.innerHTML = `
      <div class="card__icon" aria-hidden="true">${f.icon}</div>
      <h3>${f.title}</h3>
      <p>${f.body}</p>
      <div class="chipset">${f.tags.map((t) => `<span class="${/needs|permission|Chrome/.test(t) ? 'needs' : /offline|zero|local|no eval|instant|CI/.test(t) ? '' : 'limit'}">${t}</span>`).join('')}</div>
    `;
    host.append(card);
  });
}

function renderRoadmap() {
  const host = document.getElementById('roadmapList');
  ROADMAP.forEach(([label, status]) => {
    const li = document.createElement('li');
    if (status === true) li.classList.add('done');
    li.innerHTML = `<span class="mark">${status === true ? '[x]' : status === 'partly' ? '[~]' : '[ ]'}</span><span class="label">${label}</span>`;
    host.append(li);
  });
}

function renderFaq() {
  const host = document.getElementById('faqList');
  FAQ.forEach(([q, a], index) => {
    const node = document.createElement('details');
    if (index === 0) node.open = true;
    node.innerHTML = `<summary>${q}</summary><p>${a}</p>`;
    host.append(node);
  });
}

/** Small ambient touches: rotating hero console lines, network chip, year. */
function ambient() {
  const console_ = document.getElementById('mockConsole');
  const lines = [
    '> reactor ......... ONLINE\n> holographic HUD . CALIBRATED\n> local core ...... ARMED\n> memory bank ..... MOUNTED\n> At Your Service. Always.',
    '> voice pipeline .. READY\n> speech synth ..... READY\n> PWA shell ........ CACHED\n> android bridge ... AVAILABLE\n> At Your Service. Always.',
    '> search ........... WIKIPEDIA\n> calculator ....... PARSER OK\n> notes / tasks .... SYNCED\n> security ......... CSP STRICT\n> At Your Service. Always.'
  ];
  let i = 0;
  if (console_) {
    setInterval(() => {
      i = (i + 1) % lines.length;
      console_.style.opacity = '0';
      setTimeout(() => { console_.textContent = lines[i]; console_.style.opacity = '1'; }, 260);
    }, 5200);
    if (lines[0]) console_.textContent = lines[0];
  }

  const net = document.getElementById('mockNet');
  const setNet = () => { if (net) net.textContent = navigator.onLine ? 'ONLINE' : 'OFFLINE'; };
  setNet();
  window.addEventListener('online', setNet);
  window.addEventListener('offline', setNet);

  const engine = document.getElementById('mockEngine');
  try {
    const provider = JSON.parse(localStorage.getItem('jarvis.v1.settings') || '{}').provider || 'local';
    if (engine) engine.textContent = provider === 'local' ? 'LOCAL CORE' : provider.toUpperCase();
    const facts = Object.keys(JSON.parse(localStorage.getItem('jarvis.v1.memory') || '{"facts":{}}').facts || {}).length;
    const mem = document.getElementById('mockMemory');
    if (mem) mem.textContent = `${facts} fact${facts === 1 ? '' : 's'}`;
  } catch { /* the site works fine without sharing storage with the app */ }
}

/** Reveal-on-scroll for the sections, cheap and dependency free. */
function reveal() {
  const targets = document.querySelectorAll('.section, .card, .install__card, .stack__col, .roadmap li');
  if (!('IntersectionObserver' in window)) return;
  const io = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      entry.target.style.transition = 'opacity .5s ease, transform .5s ease';
      entry.target.style.opacity = '1';
      entry.target.style.transform = 'none';
      io.unobserve(entry.target);
    });
  }, { rootMargin: '0px 0px -8% 0px', threshold: 0.05 });

  targets.forEach((node) => {
    node.style.opacity = '0';
    node.style.transform = 'translateY(14px)';
    io.observe(node);
  });
}

renderFeatures();
renderRoadmap();
renderFaq();
ambient();
reveal();
