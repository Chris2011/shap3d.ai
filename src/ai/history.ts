import { reactive, watch } from 'vue';
import type { AiTurn } from './agent';

/** One conversation with the assistant (persisted in this browser). */
export interface AiSession { id: string; title: string; created: number; updated: number; model: string; turns: AiTurn[] }

const KEY = 's3d:ai-history';
const MAX_SESSIONS = 80;

function load(): { sessions: AiSession[]; currentId: string } {
  try {
    const j = JSON.parse(localStorage.getItem(KEY) ?? 'null');
    if (j && Array.isArray(j.sessions)) {
      // interrupted turns from a previous page load can't continue
      for (const s of j.sessions) for (const t of s.turns) if (t.status === 'streaming' || t.status === 'running') t.status = 'stopped';
      return { sessions: j.sessions, currentId: j.currentId ?? '' };
    }
  } catch { /* storage unavailable */ }
  return { sessions: [], currentId: '' };
}

export const aiHistory = reactive(load());

let saveTimer = 0;
watch(aiHistory, () => {
  clearTimeout(saveTimer);
  saveTimer = window.setTimeout(() => {
    try {
      aiHistory.sessions.sort((a, b) => b.updated - a.updated);
      if (aiHistory.sessions.length > MAX_SESSIONS) aiHistory.sessions.splice(MAX_SESSIONS);
      localStorage.setItem(KEY, JSON.stringify(aiHistory));
    } catch { /* quota exceeded – keep in memory */ }
  }, 400);
}, { deep: true });

const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

export function newSession(model = ''): AiSession {
  // reuse an empty current session instead of piling up empty ones
  const cur = aiHistory.sessions.find(s => s.id === aiHistory.currentId);
  if (cur && !cur.turns.length) { cur.model = model || cur.model; return cur; }
  const s: AiSession = { id: uid(), title: 'Neuer Chat', created: Date.now(), updated: Date.now(), model, turns: [] };
  aiHistory.sessions.unshift(s); aiHistory.currentId = s.id;
  return aiHistory.sessions[0];
}

export function currentSession(): AiSession {
  return aiHistory.sessions.find(s => s.id === aiHistory.currentId) ?? newSession();
}

export function openSession(id: string) { if (aiHistory.sessions.some(s => s.id === id)) aiHistory.currentId = id; }
export function deleteSession(id: string) {
  const i = aiHistory.sessions.findIndex(s => s.id === id); if (i < 0) return;
  aiHistory.sessions.splice(i, 1);
  if (aiHistory.currentId === id) aiHistory.currentId = aiHistory.sessions[0]?.id ?? '';
}
export function clearHistory() { aiHistory.sessions.splice(0); aiHistory.currentId = ''; }

/** Called whenever a turn is added – keeps title and timestamps up to date. */
export function touch(s: AiSession, model: string) {
  s.updated = Date.now(); s.model = model;
  if (s.title === 'Neuer Chat') { const first = s.turns.find(t => t.role === 'user' && !t.auto); if (first) s.title = first.text.slice(0, 70); }
}

// ------------------------------------------------------------------ formatting
const DAY = 86400000;
const startOfDay = (t: number) => { const d = new Date(t); d.setHours(0, 0, 0, 0); return d.getTime(); };

/** "Heute", "Gestern" or "Mittwoch, 15. Oktober 2026". */
export function dayLabel(t: number): string {
  const d = startOfDay(t), today = startOfDay(Date.now());
  if (d === today) return 'Heute';
  if (d === today - DAY) return 'Gestern';
  return new Date(t).toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
}
export const sameDay = (a: number, b: number) => startOfDay(a) === startOfDay(b);
export const clock = (t: number) => new Date(t).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
export const clockSec = (t: number) => new Date(t).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

/** 0:07 · 1:42 · 1:02:13 */
export function elapsed(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000)), h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), r = s % 60;
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}` : `${m}:${String(r).padStart(2, '0')}`;
}
