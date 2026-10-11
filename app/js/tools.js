/**
 * tools.js — the offline capability layer.
 * Calculator (own parser, no eval), unit conversion, and a set of utilities that
 * work with no network at all. Each tool is also exposed to the assistant brain.
 */

/* ======================= safe arithmetic evaluator ======================= */

const FUNCS = {
  sin: Math.sin, cos: Math.cos, tan: Math.tan,
  asin: Math.asin, acos: Math.acos, atan: Math.atan,
  sqrt: Math.sqrt, cbrt: Math.cbrt, abs: Math.abs,
  round: Math.round, floor: Math.floor, ceil: Math.ceil, trunc: Math.trunc,
  sign: Math.sign, exp: Math.exp, ln: Math.log, log: Math.log10,
  log2: Math.log2, log10: Math.log10, hypot: Math.hypot,
  min: Math.min, max: Math.max, pow: Math.pow,
  fact: (n) => { let r = 1; for (let i = 2; i <= Math.floor(n); i += 1) r *= i; return r; }
};
const CONSTS = { pi: Math.PI, e: Math.E, tau: Math.PI * 2, phi: (1 + Math.sqrt(5)) / 2 };
const OPS = { '+': 1, '-': 1, '*': 2, '/': 2, '%': 2, '^': 3, '**': 3 };

function tokenize(src) {
  const tokens = [];
  const str = String(src).replace(/\s+/g, '').replace(/[×✕]/g, '*').replace(/÷/g, '/').replace(/\*\*/g, '^');
  let i = 0;
  while (i < str.length) {
    const ch = str[i];
    if (/[0-9.]/.test(ch)) {
      let num = '';
      while (i < str.length && /[0-9._]/.test(str[i])) { num += str[i] === '_' ? '' : str[i]; i += 1; }
      if (str[i] === 'e' && /[0-9+-]/.test(str[i + 1] || '')) {
        num += 'e'; i += 1;
        if (/[+-]/.test(str[i])) { num += str[i]; i += 1; }
        while (i < str.length && /[0-9]/.test(str[i])) { num += str[i]; i += 1; }
      }
      if (!/^\d*\.?\d+(e[+-]?\d+)?$/.test(num)) throw new Error(`Bad number: ${num}`);
      tokens.push({ t: 'num', v: Number(num) });
      continue;
    }
    if (/[a-zA-Z]/.test(ch)) {
      let name = '';
      while (i < str.length && /[a-zA-Z0-9]/.test(str[i])) { name += str[i]; i += 1; }
      const lower = name.toLowerCase();
      if (lower in CONSTS) tokens.push({ t: 'num', v: CONSTS[lower] });
      else if (lower in FUNCS) tokens.push({ t: 'fn', v: lower });
      else throw new Error(`Unknown symbol: ${name}`);
      continue;
    }
    if (ch === '(' || ch === ')') { tokens.push({ t: ch }); i += 1; continue; }
    if (ch === ',') { tokens.push({ t: ',' }); i += 1; continue; }
    if (ch === '!') { tokens.push({ t: 'fn', v: 'fact' }); i += 1; continue; }
    if (ch in OPS) { tokens.push({ t: 'op', v: ch }); i += 1; continue; }
    throw new Error(`Unexpected character: ${ch}`);
  }
  return tokens;
}

/** Evaluate an arithmetic expression. Throws on malformed input. */
export function evaluateExpression(src) {
  const tokens = tokenize(src);
  if (!tokens.length) throw new Error('Empty expression');
  const out = [];
  const stack = [];
  let prev = null;

  for (const tok of tokens) {
    if (tok.t === 'num') out.push(tok);
    else if (tok.t === 'fn') stack.push(tok);
    else if (tok.t === ',') {
      while (stack.length && stack[stack.length - 1].t !== '(') out.push(stack.pop());
    } else if (tok.t === 'op') {
      const unary = !prev || prev.t === 'op' || prev.t === '(' || prev.t === ',';
      if (unary && (tok.v === '-' || tok.v === '+')) {
        out.push({ t: 'num', v: 0 });
        stack.push({ t: 'op', v: tok.v === '-' ? '-' : '+' });
      } else {
        while (stack.length &&
          stack[stack.length - 1].t === 'op' &&
          (OPS[stack[stack.length - 1].v] > OPS[tok.v] ||
            (OPS[stack[stack.length - 1].v] === OPS[tok.v] && tok.v !== '^'))) {
          out.push(stack.pop());
        }
        stack.push(tok);
      }
    } else if (tok.t === '(') stack.push(tok);
    else if (tok.t === ')') {
      while (stack.length && stack[stack.length - 1].t !== '(') out.push(stack.pop());
      if (!stack.length) throw new Error('Unbalanced parentheses');
      stack.pop();
      if (stack.length && stack[stack.length - 1].t === 'fn') out.push(stack.pop());
    }
    prev = tok;
  }
  while (stack.length) {
    const tok = stack.pop();
    if (tok.t === '(') throw new Error('Unbalanced parentheses');
    out.push(tok);
  }

  const vals = [];
  for (const tok of out) {
    if (tok.t === 'num') vals.push(tok.v);
    else if (tok.t === 'fn') {
      const fn = FUNCS[tok.v];
      const args = [];
      // determine arity by popping to the "arity mark" (kept by counting for known multi-arg fns)
      const arity = ['hypot', 'min', 'max', 'pow'].includes(tok.v) ? (tok.v === 'pow' ? 2 : 2) : 1;
      for (let i = 0; i < arity; i += 1) {
        if (!vals.length) throw new Error(`${tok.v} needs ${arity} value(s)`);
        args.unshift(vals.pop());
      }
      const res = fn(...args);
      if (typeof res !== 'number' || Number.isNaN(res)) throw new Error(`${tok.v} is undefined here`);
      vals.push(res);
    } else if (tok.t === 'op') {
      if (vals.length < 2) throw new Error('Malformed expression');
      const b = vals.pop();
      const a = vals.pop();
      let res;
      switch (tok.v) {
        case '+': res = a + b; break;
        case '-': res = a - b; break;
        case '*': res = a * b; break;
        case '/': if (b === 0) throw new Error('Division by zero'); res = a / b; break;
        case '%': if (b === 0) throw new Error('Modulo by zero'); res = a % b; break;
        case '^': res = a ** b; break;
        default: throw new Error(`Unsupported operator ${tok.v}`);
      }
      if (!Number.isFinite(res)) throw new Error('Result is not a finite number');
      vals.push(res);
    }
  }
  if (vals.length !== 1) throw new Error('Malformed expression');
  return vals[0];
}

export function calculator(expression) {
  const value = evaluateExpression(expression);
  return { expression, value, display: formatNumber(value) };
}

export function formatNumber(n) {
  if (Number.isInteger(n) && Math.abs(n) < 1e15) return n.toLocaleString('en-US');
  if (Math.abs(n) < 1e-6 && n !== 0) return n.toExponential(6);
  return Number(n.toFixed(10)).toLocaleString('en-US', { maximumFractionDigits: 10 });
}

/* ============================ unit conversion ============================ */

const LINEAR_UNITS = {
  length: { m: 1, km: 1000, cm: 0.01, mm: 0.001, um: 1e-6, nm: 1e-9, mi: 1609.344, yd: 0.9144, ft: 0.3048, in: 0.0254, nmi: 1852, ly: 9.4607e15 },
  mass: { kg: 1, g: 0.001, mg: 1e-6, t: 1000, lb: 0.45359237, oz: 0.028349523125, st: 6.35029318 },
  volume: { l: 1, ml: 0.001, m3: 1000, gal: 3.785411784, qt: 0.946352946, pt: 0.473176473, cup: 0.2365882365, floz: 0.0295735295625 },
  speed: { 'm/s': 1, 'km/h': 1 / 3.6, mph: 0.44704, kn: 0.514444, mach: 340.29 },
  data: { b: 1, kb: 1e3, mb: 1e6, gb: 1e9, tb: 1e12, kib: 1024, mib: 1048576, gib: 1073741824, tib: 1.099511627776e12 },
  time: { ms: 0.001, s: 1, min: 60, h: 3600, d: 86400, wk: 604800, yr: 31557600 },
  area: { m2: 1, km2: 1e6, cm2: 1e-4, ha: 10000, acre: 4046.8564224, ft2: 0.09290304, mi2: 2589988.110336 },
  energy: { j: 1, kj: 1000, cal: 4.184, kcal: 4184, wh: 3600, kwh: 3600000, ev: 1.602176634e-19 },
  pressure: { pa: 1, kpa: 1000, bar: 100000, psi: 6894.757293168, atm: 101325, mmhg: 133.322387415 },
  angle: { rad: 1, deg: Math.PI / 180, grad: Math.PI / 200, turn: Math.PI * 2 },
  frequency: { hz: 1, khz: 1000, mhz: 1e6, ghz: 1e9 }
};

const TEMP_UNITS = ['c', 'f', 'k'];
const LABELS = {
  m: 'metre', b: 'byte', s: 'second', j: 'joule', hz: 'hertz'
};

export function unitCatalogue() {
  const out = [];
  for (const [category, units] of Object.entries(LINEAR_UNITS)) {
    for (const unit of Object.keys(units)) {
      out.push({ category, unit, label: `${unit}${LABELS[unit] ? ` (${LABELS[unit]})` : ''}` });
    }
  }
  for (const unit of TEMP_UNITS) out.push({ category: 'temperature', unit, label: unit.toUpperCase() });
  return out;
}

export function convert(value, from, to) {
  const v = Number(value);
  if (!Number.isFinite(v)) throw new Error('Value must be a number');
  const f = String(from).toLowerCase();
  const t = String(to).toLowerCase();
  if (f === t) return v;

  if (TEMP_UNITS.includes(f) && TEMP_UNITS.includes(t)) {
    const celsius = f === 'c' ? v : f === 'f' ? (v - 32) * 5 / 9 : v - 273.15;
    return t === 'c' ? celsius : t === 'f' ? celsius * 9 / 5 + 32 : celsius + 273.15;
  }
  for (const units of Object.values(LINEAR_UNITS)) {
    if (f in units && t in units) return (v * units[f]) / units[t];
  }
  throw new Error(`Cannot convert ${from} → ${to}`);
}

/** Natural-language conversions, e.g. "convert 100 km to miles". */
export function convertFromText(text) {
  const m = String(text).match(/(-?\d+(?:\.\d+)?)\s*°?\s*([a-zA-Z/²3]+)\s*(?:to|in|into|as)\s*°?\s*([a-zA-Z/²3]+)/i);
  if (!m) return null;
  const map = { miles: 'mi', mile: 'mi', kilometers: 'km', kilometer: 'km', kilometres: 'km', metres: 'm', meters: 'm', meter: 'm', feet: 'ft', foot: 'ft', inches: 'in', inch: 'in', pounds: 'lb', pound: 'lb', ounces: 'oz', ounce: 'oz', kilograms: 'kg', grams: 'g', celsius: 'c', fahrenheit: 'f', kelvin: 'k', degrees: 'deg' };
  const norm = (s) => map[s.toLowerCase()] || s.toLowerCase().replace('²', '2').replace('³', '3');
  try {
    const value = convert(m[1], norm(m[2]), norm(m[3]));
    return { value, from: m[2], to: m[3], display: `${formatNumber(Number(m[1]))} ${m[2]} = ${formatNumber(Number(value.toFixed(6)))} ${m[3]}` };
  } catch {
    return null;
  }
}

/* ============================== utilities =============================== */

const DICE = { dice: 6, d6: 6, d20: 20, d12: 12, d10: 10, d8: 8, d4: 4 };

export async function sha256(text) {
  const data = new TextEncoder().encode(String(text));
  const buf = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

export function randomPassword(length = 20, symbols = true) {
  const lower = 'abcdefghijkmnopqrstuvwxyz';
  const upper = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  const digits = '23456789';
  const sym = '!@#$%^&*()-_=+[]{};:,.?';
  const pool = lower + upper + digits + (symbols ? sym : '');
  const bytesArr = new Uint32Array(length);
  crypto.getRandomValues(bytesArr);
  let out = '';
  for (let i = 0; i < length; i += 1) out += pool[bytesArr[i] % pool.length];
  return out;
}

export function randomInt(min = 1, max = 100) {
  const lo = Math.ceil(Math.min(min, max));
  const hi = Math.floor(Math.max(min, max));
  const buf = new Uint32Array(1);
  crypto.getRandomValues(buf);
  return lo + (buf[0] % (hi - lo + 1));
}

export const utilities = {
  dice: (spec = 'd6', count = 1) => {
    const sides = DICE[String(spec).toLowerCase()] || 6;
    const rolls = Array.from({ length: Math.min(Math.max(1, count), 20) }, () => randomInt(1, sides));
    return { sides, rolls, total: rolls.reduce((a, b) => a + b, 0) };
  },
  coin: () => ({ result: randomInt(0, 1) ? 'Heads' : 'Tails' }),
  random: (min, max) => ({ value: randomInt(min ?? 1, max ?? 100) }),
  uuid: () => ({ value: crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}` }),
  sha256: async (text = '') => ({ value: await sha256(text) }),
  base64enc: (text = '') => ({ value: btoa(unescape(encodeURIComponent(String(text)))) }),
  base64dec: (text = '') => ({ value: decodeURIComponent(escape(atob(String(text).trim()))) }),
  now: () => ({
    iso: new Date().toISOString(),
    time: new Date().toLocaleTimeString(),
    date: new Date().toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }),
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    epoch: Date.now()
  })
};

/* ============================ system telemetry =========================== */

export async function readTelemetry() {
  const out = { online: navigator.onLine, connection: navigator.connection?.effectiveType || '—', battery: null, memory: null, hardware: navigator.hardwareConcurrency || null, platform: navigator.platform || 'web' };
  try {
    if (navigator.getBattery) {
      const b = await navigator.getBattery();
      out.battery = { level: Math.round(b.level * 100), charging: b.charging };
    }
  } catch { /* battery API is optional */ }
  if (performance?.memory) {
    out.memory = { used: performance.memory.usedJSHeapSize, limit: performance.memory.jsHeapSizeLimit };
  }
  return out;
}
