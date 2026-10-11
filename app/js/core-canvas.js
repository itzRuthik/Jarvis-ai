/**
 * core-canvas.js — the animated holographic "arc reactor" core.
 * Pure Canvas 2D: nested rings, scanner sweep, particle field and a reactive
 * waveform that responds to microphone level and assistant state.
 */

const PALETTES = {
  cyan: { main: '#35d6ff', alt: '#0a7cff', glow: 'rgba(53,214,255,0.55)' },
  blue: { main: '#4b8cff', alt: '#1b3cff', glow: 'rgba(75,140,255,0.55)' },
  amber: { main: '#ffc857', alt: '#ff8a3d', glow: 'rgba(255,200,87,0.55)' },
  violet: { main: '#b184ff', alt: '#6f3cff', glow: 'rgba(177,132,255,0.55)' }
};

export class Reactor {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.state = 'idle';
    this.level = 0;
    this.smooth = 0;
    this.t = 0;
    this.fps = 0;
    this.particles = Array.from({ length: 46 }, () => ({
      a: Math.random() * Math.PI * 2,
      r: 0.42 + Math.random() * 0.62,
      s: 0.0016 + Math.random() * 0.005,
      size: 0.5 + Math.random() * 1.6
    }));
    this.onFps = null;
    this.running = false;
    this.palette = PALETTES.cyan;
  }

  setPalette(name) { this.palette = PALETTES[name] || PALETTES.cyan; }
  setState(state) { this.state = state; }
  setLevel(level) { this.level = level; }

  start() {
    if (this.running) return;
    this.running = true;
    let last = performance.now();
    const loop = (now) => {
      if (!this.running) return;
      const dt = now - last;
      last = now;
      this.fps = this.fps ? this.fps * 0.9 + (1000 / Math.max(1, dt)) * 0.1 : 1000 / Math.max(1, dt);
      this.t += dt / 1000;
      this.draw();
      if (this.onFps && Math.round(this.t * 2) % 4 === 0) this.onFps(this.fps);
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }

  stop() { this.running = false; }

  resize() {
    const rect = this.canvas.getBoundingClientRect();
    const dpr = Math.min(2.5, window.devicePixelRatio || 1);
    const w = Math.max(120, rect.width);
    const h = Math.max(120, rect.height);
    if (this.canvas.width !== w * dpr || this.canvas.height !== h * dpr) {
      this.canvas.width = w * dpr;
      this.canvas.height = h * dpr;
    }
    return { w, h, dpr };
  }

  draw() {
    const { ctx } = this;
    const { w, h, dpr } = this.resize();
    const cx = (w * dpr) / 2;
    const cy = (h * dpr) / 2;
    const base = Math.min(w, h) * dpr * 0.46;
    const { main, alt, glow } = this.palette;

    this.smooth += ((this.level || 0) - this.smooth) * 0.12;
    const activity = this.state === 'thinking' ? 0.55 : this.state === 'listening' ? this.smooth : this.state === 'speaking' ? 0.45 + Math.abs(Math.sin(this.t * 7)) * 0.35 : 0.1 + this.smooth;

    ctx.clearRect(0, 0, w * dpr, h * dpr);
    ctx.save();
    ctx.translate(cx, cy);

    // ---- outer rotating arcs ----
    for (let i = 0; i < 3; i += 1) {
      const r = base * (0.72 + i * 0.11);
      const speed = (i % 2 === 0 ? 1 : -1) * (0.22 + i * 0.09) * (0.6 + activity);
      ctx.beginPath();
      ctx.lineWidth = (1.1 + i * 0.5) * dpr * 0.7;
      ctx.strokeStyle = i === 0 ? alt : main;
      ctx.globalAlpha = 0.5 - i * 0.1;
      const seg = Math.PI * (0.5 + i * 0.22);
      ctx.arc(0, 0, r, this.t * speed, this.t * speed + seg);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(0, 0, r, this.t * speed + Math.PI, this.t * speed + Math.PI + seg * 0.6);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;

    // ---- tick marks ----
    ctx.globalAlpha = 0.4;
    ctx.strokeStyle = main;
    ctx.lineWidth = dpr * 0.8;
    for (let i = 0; i < 72; i += 1) {
      const angle = (i / 72) * Math.PI * 2 + this.t * 0.08;
      const inner = base * 0.5;
      const outer = base * (i % 6 === 0 ? 0.6 : 0.55);
      ctx.beginPath();
      ctx.moveTo(Math.cos(angle) * inner, Math.sin(angle) * inner);
      ctx.lineTo(Math.cos(angle) * outer, Math.sin(angle) * outer);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;

    // ---- scanner sweep ----
    const sweep = ctx.createLinearGradient(-base, -base, base, base);
    sweep.addColorStop(0, 'transparent');
    sweep.addColorStop(0.5, glow);
    sweep.addColorStop(1, 'transparent');
    ctx.save();
    ctx.rotate(this.t * 0.9);
    ctx.globalCompositeOperation = 'lighter';
    ctx.strokeStyle = sweep;
    ctx.lineWidth = base * 0.06;
    ctx.beginPath();
    ctx.arc(0, 0, base * 0.58, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
    ctx.globalCompositeOperation = 'source-over';

    // ---- particles ----
    ctx.globalCompositeOperation = 'lighter';
    for (const p of this.particles) {
      p.a += p.s * (1 + activity * 2.5);
      const x = Math.cos(p.a) * p.r * base;
      const y = Math.sin(p.a) * p.r * base * 0.98;
      ctx.globalAlpha = 0.25 + (Math.sin(this.t * 2 + p.a) + 1) * 0.25;
      ctx.fillStyle = main;
      ctx.beginPath();
      ctx.arc(x, y, p.size * dpr, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    // ---- nucleus ----
    const pulse = 1 + activity * 0.22 + Math.sin(this.t * 3.2) * 0.03;
    const coreR = base * 0.3 * pulse;
    const grad = ctx.createRadialGradient(0, 0, coreR * 0.15, 0, 0, coreR);
    grad.addColorStop(0, 'rgba(255,255,255,0.95)');
    grad.addColorStop(0.45, main);
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(0, 0, coreR, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = main;
    ctx.lineWidth = dpr * 1.6;
    ctx.globalAlpha = 0.85;
    ctx.beginPath();
    ctx.arc(0, 0, coreR * 0.98, 0, Math.PI * 2);
    ctx.stroke();
    ctx.globalAlpha = 1;

    // ---- waveform (listening / speaking) ----
    if (this.state === 'listening' || this.state === 'speaking') {
      const amp = this.state === 'listening' ? 0.25 + this.smooth * 1.6 : 0.5;
      ctx.strokeStyle = main;
      ctx.lineWidth = dpr * 1.4;
      ctx.beginPath();
      for (let i = 0; i <= 96; i += 1) {
        const p = i / 96;
        const x = (p - 0.5) * base * 1.5;
        const env = Math.sin(p * Math.PI);
        const y = Math.sin(p * Math.PI * 12 + this.t * 9) * base * 0.12 * amp * env;
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }

    // ---- thinking dashes ----
    if (this.state === 'thinking') {
      ctx.strokeStyle = main;
      ctx.lineWidth = dpr * 2;
      ctx.setLineDash([base * 0.05, base * 0.045]);
      ctx.lineDashOffset = -this.t * base * 0.32;
      ctx.beginPath();
      ctx.arc(0, 0, base * 0.86, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    ctx.globalCompositeOperation = 'source-over';
    ctx.restore();
  }
}
