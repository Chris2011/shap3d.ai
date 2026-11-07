import { brickOf, colorOf, placedBricks, type BrickData } from './bricks';
import { colorName } from './colors';
import { sizeLabel } from './catalog';
import { LDRAW_PREFIX, partInfo } from './parts';
import { t } from './runtime';

/** The parts list: equal parts in the same colour counted together. */
export interface ListEntry {
  key: string;
  data: BrickData;
  name: string;
  color: string;
  count: number;
  ids: number[];
}

/** a part's own name follows the language; the name on a component is only for a part this session does not know */
const nameOf = (data: BrickData) => partInfo(data.part)?.name ?? data.name;

export const brickList = (): ListEntry[] => {
  const entries = new Map<string, ListEntry>();
  const count = (data: BrickData, color: string, id: number) => {
    const key = `${data.part}/${color}`;
    const entry = entries.get(key) ?? { key, data, name: nameOf(data), color, count: 0, ids: [] };
    entry.count++;
    if (!entry.ids.includes(id)) {
      entry.ids.push(id);
    }
    entries.set(key, entry);
  };
  for (const { instance, data } of placedBricks()) {
    if (!data.model) {
      count(data, colorOf(instance), instance.id);
      continue;
    }
    // a finished model counts brick by brick; clicking a line selects the whole model
    for (const child of instance.definition.entities.instances.values()) {
      const part = brickOf(child.definition);
      if (part) {
        count(part, colorOf(child), instance.id);
      }
    }
  }
  return [...entries.values()].sort((a, b) => a.name.localeCompare(b.name) || a.color.localeCompare(b.color));
};

/** who to name for what came from the library and its model collection, as their licence asks; the parts inside a model are named in its file */
export const creditLines = () => {
  const lines = new Set<string>();
  for (const { data } of placedBricks()) {
    if (data.model) {
      const credit = data.modelCredit;
      if (typeof credit?.author === 'string' && credit.author) {
        lines.add(t('bricks.list.modelCredit', { name: data.name, author: credit.author, license: String(credit.license ?? '') }));
      }
    } else if (data.credit && typeof data.credit.number === 'string') {
      lines.add(
        t('bricks.list.credit', {
          number: data.credit.number,
          author: String(data.credit.author ?? ''),
          license: String(data.credit.license ?? ''),
        }),
      );
    }
  }
  return [...lines];
};

/** a cell from a source's data must not start a formula when the file is opened in a spreadsheet */
const csvCell = (value: string | number) => {
  const text = String(value);
  const safe = /^[=+\-@]/.test(text) ? `'${text}` : text;
  return /[";\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
};

/** the list as CSV (semicolons – opens in spreadsheets of any language) */
export const brickCsv = () => {
  const header = [t('bricks.list.count'), t('bricks.list.part'), t('bricks.list.color'), t('bricks.list.size'), t('bricks.list.number')];
  const rows = brickList().map((entry) => [
    entry.count,
    entry.name,
    colorName(entry.color),
    sizeLabel(entry.data.w, entry.data.d),
    entry.data.part.startsWith(LDRAW_PREFIX) ? entry.data.part.slice(LDRAW_PREFIX.length) : '',
  ]);
  return [header, ...rows].map((row) => row.map(csvCell).join(';')).join('\r\n') + '\r\n';
};
