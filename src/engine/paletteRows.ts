import { fuzzy, type PaletteItem } from './palette';
import { t } from '../i18n';

/** `>` commands, `@` objects in the model, `#` materials – or '' for everything. */
export type PalettePrefix = '>' | '@' | '#' | '';

/** A piece of a label, marked when it matched the search. */
export interface LabelSegment {
  t: string;
  hit: boolean;
}

/** One line of the command palette. */
export interface PaletteRow {
  item: PaletteItem;
  segs: LabelSegment[];
  /** a group heading shown above this row */
  header?: string;
  /** on/off of a switch command */
  state: boolean;
  disabled: boolean;
}

/** most rows shown at once */
export const PALETTE_LIMIT = 120;

/** The prefix the query starts with, and the search text after it. */
export const splitPrefix = (query: string): { prefix: PalettePrefix; text: string } => {
  const first = query.trimStart()[0];
  const prefix: PalettePrefix = first === '>' || first === '@' || first === '#' ? first : '';
  return { prefix, text: (prefix ? query.trimStart().slice(1) : query).trim() };
};

/** The label cut into runs of matched and unmatched characters (`hits` = indexes of matched characters). */
export const highlightSegments = (label: string, hits: number[]) => {
  const set = new Set(hits);
  const out: LabelSegment[] = [];
  for (let i = 0; i < label.length; i++) {
    const hit = set.has(i);
    const last = out[out.length - 1];
    if (last && last.hit === hit) {
      last.t += label[i];
    } else {
      out.push({ t: label[i], hit });
    }
  }
  return out;
};

const fitsPrefix = (item: PaletteItem, prefix: PalettePrefix) => {
  const kind = item.kind ?? 'action';
  return prefix === '>' ? kind === 'action' : prefix === '@' ? kind === 'object' : prefix === '#' ? kind === 'material' : true;
};

const makeRow = (item: PaletteItem, hits: number[] = [], header?: string): PaletteRow => ({
  item,
  segs: highlightSegments(item.label, hits),
  header,
  state: !!item.checked?.(),
  disabled: !!item.enabled && !item.enabled(),
});

/**
 * The rows for a query. Empty: recently used first, then the actions (objects and materials only behind their
 * prefix). Otherwise the fuzzy matches – also by group and keywords – best first, recent ones a little higher.
 */
export const paletteRows = (items: readonly PaletteItem[], query: string, recent: readonly string[]): PaletteRow[] => {
  const { prefix, text } = splitPrefix(query);
  const pool = items.filter((item) => fitsPrefix(item, prefix));
  if (!text) {
    const byId = new Map(pool.map((item) => [item.id, item]));
    const recentItems = recent.map((id) => byId.get(id)).filter((entry): entry is PaletteItem => !!entry);
    const rest = pool.filter((item) => !recent.includes(item.id) && (prefix || (item.kind ?? 'action') === 'action'));
    const restHeader = prefix === '@' ? t('palette.objectsInModel') : prefix === '#' ? t('palette.materials') : t('palette.allCommands');
    return [
      ...recentItems.map((item, index) => makeRow(item, [], index === 0 ? t('palette.recent') : undefined)),
      ...rest.slice(0, PALETTE_LIMIT).map((item, index) => makeRow(item, [], index === 0 ? restHeader : undefined)),
    ];
  }
  const scored: { item: PaletteItem; score: number; hits: number[] }[] = [];
  for (const item of pool) {
    const match = fuzzy(text, item.label);
    const extra = !match && `${item.group} ${item.keywords ?? ''}`.toLowerCase().includes(text.toLowerCase());
    if (!match && !extra) {
      continue;
    }
    let score = match ? match.score : 200 - item.label.length * 0.5;
    if (recent.includes(item.id)) {
      score += 40 - recent.indexOf(item.id) * 4;
    }
    if (item.enabled && !item.enabled()) {
      score -= 30;
    }
    scored.push({ item, score, hits: match?.hits ?? [] });
  }
  scored.sort((first, second) => second.score - first.score);
  return scored.slice(0, PALETTE_LIMIT).map((entry) => makeRow(entry.item, entry.hits));
};
