/**
 * voice.js — speech recognition, speech synthesis and microphone level metering.
 *
 * Uses the Web Speech APIs, which are available in Chrome/Edge on desktop and
 * Android. Feature detection is exposed so the UI can degrade gracefully.
 */

import { getSettings } from './store.js';

const SR = window.SpeechRecognition || window.webkitSpeechRecognition;

export const voiceSupport = {
  recognition: Boolean(SR),
  // Check the object itself, not just the property: embedded WebViews and
  // privacy-focused browsers expose `speechSynthesis` as undefined.
  synthesis: typeof window.speechSynthesis !== 'undefined' && window.speechSynthesis !== null,
  mic: Boolean(navigator.mediaDevices?.getUserMedia)
};

export class Voice {
  constructor() {
    this.recognition = null;
    this.recognising = false;
    this.continuous = false;
    this.handsFree = false;
    this.audioCtx = null;
    this.analyser = null;
    this.micStream = null;
    this.level = 0;
    this.raf = 0;
    this.speakTimer = 0;
  }

  /* ------------------------------ recognition ----------------------------- */

  startRecognition({ continuous = false, wakeWords = [], onPartial = () => {}, onFinal = () => {}, onEnd = () => {}, onError = () => {} } = {}) {
    if (!SR) { onError(new Error('Speech recognition is not supported in this browser.')); return false; }
    this.stopRecognition();
    const rec = new SR();
    this.recognition = rec;
    this.continuous = continuous;
    this.wakeWords = wakeWords.map((w) => w.toLowerCase());
    rec.continuous = continuous;
    rec.interimResults = true;
    rec.lang = navigator.language || 'en-US';
    rec.maxAlternatives = 1;

    rec.onstart = () => { this.recognising = true; };
    rec.onresult = (event) => {
      let interim = '';
      let final = '';
      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        const res = event.results[i];
        if (res.isFinal) final += res[0].transcript;
        else interim += res[0].transcript;
      }
      if (interim) onPartial(interim.trim());
      if (final.trim()) {
        let text = final.trim();
        if (this.wakeWords.length) {
          const lower = text.toLowerCase();
          const hit = this.wakeWords.find((w) => lower.includes(w));
          if (!hit) return;
          const idx = lower.indexOf(hit);
          text = text.slice(idx + hit.length).replace(/^[\s,.:!?-]+/, '').trim();
          if (!text) { onPartial('Wake word detected — listening…'); return; }
        }
        onFinal(text);
        if (!continuous) this.stopRecognition();
      }
    };
    rec.onerror = (event) => {
      const map = {
        'not-allowed': 'Microphone permission was denied. Enable it in the browser or Android app settings.',
        'service-not-allowed': 'Speech service unavailable. Chrome may need a network connection for recognition.',
        'no-speech': 'I did not catch that — no speech detected.',
        network: 'Speech recognition lost its network connection.',
        aborted: ''
      };
      const message = map[event.error] ?? `Speech error: ${event.error}`;
      this.recognising = false;
      if (message) onError(new Error(message));
      onEnd();
    };
    rec.onend = () => {
      this.recognising = false;
      onEnd();
    };

    try {
      rec.start();
      return true;
    } catch (err) {
      onError(err);
      return false;
    }
  }

  stopRecognition() {
    if (this.recognition) {
      try { this.recognition.onend = null; this.recognition.abort(); } catch { /* ignore */ }
      this.recognition = null;
    }
    this.recognising = false;
  }

  /* -------------------------------- speaking ------------------------------ */

  voices() {
    if (!voiceSupport.synthesis || !window.speechSynthesis) return [];
    try {
      return window.speechSynthesis.getVoices() || [];
    } catch {
      return [];
    }
  }

  speak(text, { voiceName = '', rate = 1, pitch = 0.9, onStart = () => {}, onEnd = () => {} } = {}) {
    if (!voiceSupport.synthesis || !window.speechSynthesis || typeof SpeechSynthesisUtterance !== 'function' || !text) {
      onEnd();
      return;
    }
    this.cancel();
    const utterance = new SpeechSynthesisUtterance(String(text).slice(0, 3200));
    const voices = this.voices();
    const chosen = voices.find((v) => v.name === voiceName) ||
      voices.find((v) => /google (uk|us) english/i.test(v.name)) ||
      voices.find((v) => v.lang?.toLowerCase().startsWith('en'));
    if (chosen) utterance.voice = chosen;
    utterance.rate = rate;
    utterance.pitch = pitch;
    utterance.volume = 1;
    utterance.onstart = () => onStart();
    utterance.onend = () => { clearTimeout(this.speakTimer); onEnd(); };
    utterance.onerror = () => { clearTimeout(this.speakTimer); onEnd(); };
    // Chrome sometimes never fires onend; a length-based watchdog keeps the HUD honest.
    this.speakTimer = setTimeout(() => onEnd(), Math.min(120000, 4000 + String(text).length * 90));
    window.speechSynthesis.speak(utterance);
  }

  cancel() {
    clearTimeout(this.speakTimer);
    if (voiceSupport.synthesis && window.speechSynthesis) {
      try { window.speechSynthesis.cancel(); } catch { /* ignore */ }
    }
  }

  /* ------------------------------ mic metering ---------------------------- */

  async startMeter() {
    if (!voiceSupport.mic) return false;
    try {
      this.micStream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
      this.audioCtx = this.audioCtx || new (window.AudioContext || window.webkitAudioContext)();
      const source = this.audioCtx.createMediaStreamSource(this.micStream);
      this.analyser = this.audioCtx.createAnalyser();
      this.analyser.fftSize = 512;
      source.connect(this.analyser);
      const data = new Uint8Array(this.analyser.frequencyBinCount);
      const tick = () => {
        if (!this.analyser) return;
        this.analyser.getByteFrequencyData(data);
        const avg = data.reduce((a, b) => a + b, 0) / data.length;
        this.level = Math.min(1, avg / 90);
        this.raf = requestAnimationFrame(tick);
      };
      tick();
      return true;
    } catch {
      return false;
    }
  }

  stopMeter() {
    cancelAnimationFrame(this.raf);
    this.level = 0;
    this.analyser = null;
    if (this.micStream) {
      this.micStream.getTracks().forEach((t) => t.stop());
      this.micStream = null;
    }
  }

  getLevel() { return this.level; }
}

export const voice = new Voice();

/** Decide whether a reply should be spoken, honouring the configured voice mode. */
export function shouldSpeak(text, settings = getSettings()) {
  if (settings.voiceMode === 'off') return false;
  if (!voiceSupport.synthesis) return false;
  const plain = String(text || '').trim();
  if (!plain) return false;
  if (settings.voiceMode === 'short') return plain.length <= 320;
  return true;
}
