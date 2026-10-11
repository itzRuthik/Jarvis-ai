/**
 * store.js — local-first persistence: settings, memory, notes, tasks, transcript.
 * The API key can live in localStorage (persistent) or sessionStorage (session only).
 * Nothing here ever leaves the device except in calls the operator explicitly triggers.
 */

import { APP, DEFAULTS } from './config.js';
import { uuid } from './util.js';

const KEY = (name) => `${APP.storagePrefix}${name}`;

const read = (name, fallback) => {
  try {
    const raw = localStorage.getItem(KEY(name));
    if (!raw) return structuredClone(fallback);
    const parsed = JSON.parse(raw);
    return parsed ?? structuredClone(fallback);
  } catch {
    return structuredClone(fallback);
  }
};

const write = (name, value) => {
  try {
    localStorage.setItem(KEY(name), JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
};

/* ------------------------------- settings ------------------------------- */

let settings = { ...DEFAULTS, ...read('settings', {}) };

export const getSettings = () => settings;

export function saveSettings(patch = {}) {
  settings = { ...settings, ...patch };
  // API keys are persisted only when the operator allows it.
  const persisted = { ...settings };
  if (settings.sessionKeyOnly) persisted.apiKey = '';
  write('settings', persisted);
  if (settings.sessionKeyOnly && settings.apiKey) {
    try { sessionStorage.setItem(KEY('apiKeySession'), settings.apiKey); } catch { /* ignore */ }
  }
  return settings;
}

export function hydrateSessionKey() {
  try {
    const key = sessionStorage.getItem(KEY('apiKeySession'));
    if (key && !settings.apiKey) settings.apiKey = key;
  } catch { /* ignore */ }
  return settings;
}

export function resetSettings() {
  settings = { ...DEFAULTS };
  write('settings', settings);
  try { sessionStorage.removeItem(KEY('apiKeySession')); } catch { /* ignore */ }
  return settings;
}

/* -------------------------------- memory -------------------------------- */

let memory = read('memory', { facts: {}, updated: 0 });

export const getMemory = () => memory;
export const memoryFacts = () => Object.entries(memory.facts).map(([k, v]) => ({ key: k, value: v }));

export function rememberFact(key, value) {
  const cleanKey = String(key || '').trim().slice(0, 80);
  const cleanVal = String(value ?? '').trim().slice(0, 600);
  if (!cleanKey || !cleanVal) return false;
  memory.facts[cleanKey] = cleanVal;
  memory.updated = Date.now();
  write('memory', memory);
  return true;
}

export function forgetFact(key) {
  const cleanKey = String(key || '').trim();
  const existed = Object.keys(memory.facts).some((k) => k.toLowerCase() === cleanKey.toLowerCase());
  for (const k of Object.keys(memory.facts)) {
    if (k.toLowerCase() === cleanKey.toLowerCase()) delete memory.facts[k];
  }
  write('memory', memory);
  return existed;
}

export function clearMemory() {
  memory = { facts: {}, updated: Date.now() };
  write('memory', memory);
}

/* --------------------------------- notes --------------------------------- */

let notes = read('notes', []);

export const getNotes = () => notes;
export function addNote(title, body = '') {
  const note = { id: uuid(), title: String(title).trim().slice(0, 120) || 'Untitled', body: String(body).slice(0, 8000), created: Date.now() };
  notes = [note, ...notes].slice(0, 300);
  write('notes', notes);
  return note;
}
export function updateNote(id, patch) {
  notes = notes.map((n) => (n.id === id ? { ...n, ...patch } : n));
  write('notes', notes);
}
export function deleteNote(id) {
  notes = notes.filter((n) => n.id !== id);
  write('notes', notes);
}

/* --------------------------------- tasks --------------------------------- */

let tasks = read('tasks', []);

export const getTasks = () => tasks;
export function addTask(title, priority = 'normal', due = null) {
  const task = { id: uuid(), title: String(title).trim().slice(0, 200) || 'Untitled task', priority, due, done: false, created: Date.now() };
  tasks = [task, ...tasks].slice(0, 500);
  write('tasks', tasks);
  return task;
}
export function toggleTask(id) {
  tasks = tasks.map((t) => (t.id === id ? { ...t, done: !t.done, completed: !t.done ? Date.now() : null } : t));
  write('tasks', tasks);
}
export function deleteTask(id) {
  tasks = tasks.filter((t) => t.id !== id);
  write('tasks', tasks);
}
export function clearCompletedTasks() {
  tasks = tasks.filter((t) => !t.done);
  write('tasks', tasks);
}

/* -------------------------------- history -------------------------------- */

let history = read('history', []);

export const getHistory = () => history;
export function pushHistory(message) {
  if (settings.historyLimit === 0) return;
  history = [...history, message].slice(-settings.historyLimit);
  write('history', history);
}
export function clearHistory() {
  history = [];
  write('history', history);
}
export function setHistory(value) {
  history = Array.isArray(value) ? value.slice(-300) : [];
  write('history', history);
}

/* ------------------------------ whole-store ------------------------------ */

export function exportAll() {
  return JSON.stringify({
    app: APP.name,
    version: APP.version,
    exported: new Date().toISOString(),
    settings: { ...settings, apiKey: '' }, // never export credentials
    memory,
    notes,
    tasks,
    history
  }, null, 2);
}

export function importAll(json) {
  const data = JSON.parse(json);
  if (!data || typeof data !== 'object') throw new Error('Unrecognised backup file');
  if (data.settings) saveSettings({ ...data.settings, apiKey: settings.apiKey });
  if (data.memory?.facts) { memory = data.memory; write('memory', memory); }
  if (Array.isArray(data.notes)) { notes = data.notes; write('notes', notes); }
  if (Array.isArray(data.tasks)) { tasks = data.tasks; write('tasks', tasks); }
  if (Array.isArray(data.history)) { history = data.history; write('history', history); }
  return true;
}

export function wipeAll() {
  for (const name of ['settings', 'memory', 'notes', 'tasks', 'history']) {
    try { localStorage.removeItem(KEY(name)); } catch { /* ignore */ }
  }
  try { sessionStorage.removeItem(KEY('apiKeySession')); } catch { /* ignore */ }
  settings = { ...DEFAULTS };
  memory = { facts: {}, updated: 0 };
  notes = [];
  tasks = [];
  history = [];
}

export function storageFootprint() {
  let total = 0;
  for (const name of ['settings', 'memory', 'notes', 'tasks', 'history']) {
    try { total += (localStorage.getItem(KEY(name)) || '').length; } catch { /* ignore */ }
  }
  return total * 2; // approximate UTF-16 bytes
}
