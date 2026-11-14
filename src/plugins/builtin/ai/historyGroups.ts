import { dayLabel, type AiSession } from './history';
import { localize } from '../../../i18n';

/** Does the chat mention `term` (lower case) – in its title, a message or generated code? */
const mentions = (session: AiSession, term: string) =>
  localize(session.title).toLowerCase().includes(term) ||
  session.turns.some((turn) => turn.text.toLowerCase().includes(term) || (turn.code ?? '').toLowerCase().includes(term));

/** The chats with messages that match `search`, newest first, grouped by day ("Today", "Yesterday", a date). */
export const groupSessionsByDay = (sessions: readonly AiSession[], search: string) => {
  const term = search.trim().toLowerCase();
  const list = sessions.filter((session) => session.turns.length && (!term || mentions(session, term)));
  const groups: { day: string; sessions: AiSession[] }[] = [];
  for (const session of [...list].sort((first, second) => second.updated - first.updated)) {
    const day = dayLabel(session.updated);
    const lastGroup = groups[groups.length - 1];
    if (lastGroup && lastGroup.day === day) {
      lastGroup.sessions.push(session);
    } else {
      groups.push({ day, sessions: [session] });
    }
  }
  return groups;
};

/** How many questions the user asked in the chat (automatic fix requests not counted). */
export const requestCount = (session: AiSession) => session.turns.filter((turn) => turn.role === 'user' && !turn.auto).length;
