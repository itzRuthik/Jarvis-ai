/**
 * main.js — entry point: hydrate settings, register the service worker, start the HUD.
 */

import { initUI } from './ui.js';
import { hydrateSessionKey, getSettings } from './store.js';

function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch((err) => {
      console.warn('[JARVIS] Service worker registration failed:', err.message);
    });
  });
}

/**
 * Detect the Android shell. Capacitor serves the bundled app from
 * https://localhost, which is a reliable, dependency-free fingerprint.
 */
export function detectShell() {
  const capacitor = location.protocol === 'https:' && (location.hostname === 'localhost' || location.hostname === '127.0.0.1');
  const androidWebView = /Android/i.test(navigator.userAgent) && /\bwv\b|Version\/4\.0/i.test(navigator.userAgent);
  if (capacitor || androidWebView) {
    document.documentElement.dataset.shell = 'android';
    return 'android';
  }
  if (window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone) {
    document.documentElement.dataset.shell = 'pwa';
    return 'pwa';
  }
  document.documentElement.dataset.shell = 'browser';
  return 'browser';
}

function guardInsecureContext() {
  const insecure = location.protocol === 'http:' && !/^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname);
  if (insecure) {
    console.warn('[JARVIS] Speech recognition, microphone and service workers require HTTPS or localhost.');
  }
}

function boot() {
  hydrateSessionKey();
  guardInsecureContext();
  const shell = detectShell();
  registerServiceWorker();
  initUI();
  const settings = getSettings();
  console.info(`[JARVIS] v${'1.1.0'} online · shell=${shell} · engine=${settings.provider} · theme=${settings.theme}`);
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
else boot();
