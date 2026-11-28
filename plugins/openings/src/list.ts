// The window and door schedule: all openings in the model, equal ones counted together, and the same as CSV.
import type { Entities } from '../../../src/core/model';
import type { PluginContext } from '../../../src/plugins/types';
import { openingOf, type OpeningData } from './place';
import { t } from './runtime';

export interface ScheduleRow {
  kind: OpeningData['kind'];
  width: number;
  height: number;
  sill: number;
  sashes: number;
  count: number;
}

export const schedule = (context: PluginContext): ScheduleRow[] => {
  const rows = new Map<string, ScheduleRow>();
  const walk = (entities: Entities) => {
    for (const instance of entities.instances.values()) {
      const data = openingOf(context, instance);
      if (!data) {
        walk(instance.definition.entities);
        continue;
      }
      const sashes = data.kind === 'door' ? 1 : data.sashes;
      const key = [data.kind, data.width.toFixed(3), data.height.toFixed(3), data.sill.toFixed(3), sashes].join('|');
      const row = rows.get(key) ?? { kind: data.kind, width: data.width, height: data.height, sill: data.sill, sashes, count: 0 };
      row.count++;
      rows.set(key, row);
    }
  };
  walk(context.editor.model.root);
  return [...rows.values()].sort((a, b) => a.kind.localeCompare(b.kind) || b.width - a.width || b.height - a.height);
};

const millimetres = (metres: number) => Math.round(metres * 1000);
const cell = (value: string | number) => (/[;"\r\n]/.test(String(value)) ? `"${String(value).replace(/"/g, '""')}"` : String(value));

/** the schedule as CSV (semicolons, sizes in mm, BOM so Excel reads the umlauts) */
export const scheduleCsv = (context: PluginContext) => {
  const rows = schedule(context);
  if (!rows.length) {
    throw new Error(t('openings.list.empty'));
  }
  const header = ['kind', 'count', 'width', 'height', 'sill', 'sashes'].map((column) => t(`openings.columns.${column}`));
  const lines = rows.map((row) => [
    t(`openings.kinds.${row.kind}`),
    row.count,
    millimetres(row.width),
    millimetres(row.height),
    millimetres(row.sill),
    row.sashes,
  ]);
  return '﻿' + [header, ...lines].map((line) => line.map(cell).join(';')).join('\r\n');
};
