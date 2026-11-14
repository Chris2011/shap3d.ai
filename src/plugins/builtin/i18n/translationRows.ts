import type { Area } from './areas';

/** One text in the translation editor. */
export interface TranslationRow {
  key: string;
  area: Area;
  source: string;
  /** the same text in the reference language (German), '' without one */
  reference: string;
  /** the translation, '' while missing */
  text: string;
  /** edited here, differs from the shipped translation */
  changed: boolean;
  /** placeholders of the source, e.g. "count, name" */
  placeholders: string;
  /** the translation has other placeholders than the source */
  placeholderProblem: boolean;
}

/** The placeholder names in a text, sorted and joined: "Hello {name}, {count}" → "count, name". */
export const placeholdersOf = (text: string) =>
  [...text.matchAll(/\{(\w+)\}/g)]
    .map((match) => match[1])
    .sort()
    .join(', ');

/** Lower case without accents, for searching: "Fläche" → "flache". */
export const normaliseForSearch = (text: string) =>
  text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');

type Messages = Record<string, string>;

/** A row per key, with the source, reference and target texts. */
export const buildTranslationRows = (
  keys: readonly string[],
  texts: { source: Messages; target: Messages; reference: Messages },
  areaOf: (key: string) => Area,
  isChanged: (key: string) => boolean,
): TranslationRow[] =>
  keys.map((key) => {
    const text = texts.target[key] ?? '';
    const placeholders = placeholdersOf(texts.source[key]);
    return {
      key,
      area: areaOf(key),
      source: texts.source[key],
      reference: texts.reference[key] ?? '',
      text,
      changed: isChanged(key),
      placeholders,
      placeholderProblem: !!text && placeholdersOf(text) !== placeholders,
    };
  });

/**
 * The rows of an area ('all' for every one) that contain every word of `search` – with `missingOnly` only
 * untranslated ones, plus those in `keep` (edited since the filter was set, so they do not vanish while typing).
 */
export const filterTranslationRows = (
  rows: readonly TranslationRow[],
  filter: { area: string; search: string; missingOnly: boolean; keep: ReadonlySet<string> },
) => {
  const words = normaliseForSearch(filter.search.trim()).split(/\s+/).filter(Boolean);
  return rows.filter(
    (row) =>
      (filter.area === 'all' || row.area.id === filter.area) &&
      (!filter.missingOnly || !row.text || filter.keep.has(row.key)) &&
      words.every((word) => normaliseForSearch(`${row.key} ${row.source} ${row.reference} ${row.text}`).includes(word)),
  );
};

/** The areas that have texts, each with how many are missing (unsorted). */
export const missingPerArea = (rows: readonly TranslationRow[]) => {
  const missing = new Map<string, number>();
  const present = new Map<string, Area>();
  for (const row of rows) {
    present.set(row.area.id, row.area);
    if (!row.text) {
      missing.set(row.area.id, (missing.get(row.area.id) ?? 0) + 1);
    }
  }
  return [...present.values()].map((area) => ({ ...area, missing: missing.get(area.id) ?? 0 }));
};

/** Lines for the text field of a source text: about 38 characters per line, 1 to 6. */
export const textareaRows = (text: string) => Math.min(6, Math.max(1, Math.ceil(text.length / 38), text.split('\n').length));
