import { reactive, watch } from 'vue';
import type { AiTurn } from './agent';

/** One conversation with the assistant (persisted in this browser). */
export interface AiSession { id: string; title: string; created: number; updated: number; model: string; turns: AiTurn[] }

const KEY = 's3d:ai-history';
const MAX_SESSIONS = 80;

const load = (): { sessions: AiSession[]; currentId: string } => {
  try {
    const stored = JSON.parse(localStorage.getItem(KEY) ?? 'null');
    if (stored && Array.isArray(stored.sessions)) {
      // interrupted turns from a previous page load can't continue
      for (const session of stored.sessions) for (const turn of session.turns) if (turn.status === 'streaming' || turn.status === 'running') turn.status = 'stopped';
      return { sessions: stored.sessions, currentId: stored.currentId ?? '' };
    }
  } catch { /* storage unavailable */ }
  return { sessions: [], currentId: '' };
};

export const aiHistory = reactive(load());

let saveTimer = 0;
watch(aiHistory, () => {
  clearTimeout(saveTimer);
  saveTimer = window.setTimeout(() => {
    try {
      aiHistory.sessions.sort((left, right) => right.updated - left.updated);
      if (aiHistory.sessions.length > MAX_SESSIONS) aiHistory.sessions.splice(MAX_SESSIONS);
      localStorage.setItem(KEY, JSON.stringify(aiHistory));
    } catch { /* quota exceeded – keep in memory */ }
  }, 400);
}, { deep: true });

const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

export const newSession = (model = ''): AiSession => {
  // reuse an empty current session instead of piling up empty ones
  const cur = aiHistory.sessions.find(candidate => candidate.id === aiHistory.currentId);
  if (cur && !cur.turns.length) { cur.model = model || cur.model; return cur; }
  const session: AiSession = { id: uid(), title: 'Neuer Chat', created: Date.now(), updated: Date.now(), model, turns: [] };
  aiHistory.sessions.unshift(session); aiHistory.currentId = session.id;
  return aiHistory.sessions[0];
};

export const currentSession = (): AiSession => {
  return aiHistory.sessions.find(session => session.id === aiHistory.currentId) ?? newSession();
};

export const openSession = (id: string) => { if (aiHistory.sessions.some(session => session.id === id)) aiHistory.currentId = id; };
export const deleteSession = (id: string) => {
  const i = aiHistory.sessions.findIndex(session => session.id === id); if (i < 0) return;
  aiHistory.sessions.splice(i, 1);
  if (aiHistory.currentId === id) aiHistory.currentId = aiHistory.sessions[0]?.id ?? '';
};
export const clearHistory = () => { aiHistory.sessions.splice(0); aiHistory.currentId = ''; };

/** Called whenever a turn is added – keeps title and timestamps up to date. */
export const touch = (session: AiSession, model: string) => {
  session.updated = Date.now(); session.model = model;
  if (session.title === 'Neuer Chat') { const first = session.turns.find(turn => turn.role === 'user' && !turn.auto); if (first) session.title = first.text.slice(0, 70); }
};

// ------------------------------------------------------------------ formatting
const DAY = 86400000;
const startOfDay = (time: number) => { const date = new Date(time); date.setHours(0, 0, 0, 0); return date.getTime(); };

/** "Heute", "Gestern" or "Mittwoch, 15. Oktober 2026". */
export const dayLabel = (time: number): string => {
  const day = startOfDay(time), today = startOfDay(Date.now());
  if (day === today) return 'Heute';
  if (day === today - DAY) return 'Gestern';
  return new Date(time).toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
};
export const sameDay = (first: number, second: number) => startOfDay(first) === startOfDay(second);
export const clock = (time: number) => new Date(time).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
export const clockSec = (time: number) => new Date(time).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

/** 0:07 · 1:42 · 1:02:13 */
export const elapsed = (millis: number): string => {
  const totalSeconds = Math.max(0, Math.floor(millis / 1000)), hours = Math.floor(totalSeconds / 3600), minutes = Math.floor((totalSeconds % 3600) / 60), seconds = totalSeconds % 60;
  return hours ? `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}` : `${minutes}:${String(seconds).padStart(2, '0')}`;
};
