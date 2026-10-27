import { itemById } from './catalog';
import { furnitureName, placedFurniture, type FurnitureData } from './furniture';
import { t } from './runtime';

/** The list of what is in the room – equal pieces counted together, like a shopping list. */
export interface ListEntry {
  key: string;
  data: FurnitureData;
  name: string;
  count: number;
  ids: number[];
}

export const furnitureList = (): ListEntry[] => {
  const entries = new Map<string, ListEntry>();
  for (const { instance, data } of placedFurniture()) {
    const key = JSON.stringify([data.item, data.params]);
    const entry = entries.get(key) ?? { key, data, name: furnitureName(data), count: 0, ids: [] };
    entry.count++;
    entry.ids.push(instance.id);
    entries.set(key, entry);
  }
  return [...entries.values()].sort((a, b) => a.name.localeCompare(b.name));
};

/** the parameters of a piece in words, e.g. "3 seats, Grey fabric" */
export const describeParams = (data: FurnitureData) => {
  const item = itemById(data.item);
  if (!item) {
    return '';
  }
  return item.params
    .map((definition) => {
      const value = data.params[definition.key];
      if (definition.kind === 'material') {
        return t(`roomplanner.materials.${value}`);
      }
      if (typeof value === 'string') {
        return t(`roomplanner.options.${value}`);
      }
      return definition.unit === 'm'
        ? `${t(`roomplanner.params.${definition.key}`)} ${Math.round(value * 100)} cm`
        : `${t(`roomplanner.params.${definition.key}`)} ${value}`;
    })
    .join(', ');
};

const csvCell = (value: string | number) => {
  const text = String(value);
  return /[";\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};

/** the list as CSV (semicolons – opens in spreadsheets of any language) */
export const furnitureCsv = () => {
  const header = [
    t('roomplanner.list.count'),
    t('roomplanner.list.item'),
    t('roomplanner.list.width'),
    t('roomplanner.list.depth'),
    t('roomplanner.list.height'),
    t('roomplanner.list.details'),
  ];
  const rows = furnitureList().map((entry) => [
    entry.count,
    t(`roomplanner.items.${entry.data.item}`),
    Math.round(entry.data.size[0] * 100),
    Math.round(entry.data.size[1] * 100),
    Math.round(entry.data.size[2] * 100),
    describeParams(entry.data),
  ]);
  return [header, ...rows].map((row) => row.map(csvCell).join(';')).join('\r\n') + '\r\n';
};
