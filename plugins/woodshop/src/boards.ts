// Boards and the cut list – plain numbers only (no three.js), so they can be tested on their own
// (test/boards.test.ts).

/** what makes a group a board: which way the grain runs and how many edges get edge banding */
export interface BoardData {
  /** the grain runs along the board's longest side ('length') or across it ('width') */
  grain: 'length' | 'width';
  /** banded edges along the grain (0–2) */
  bandLong: number;
  /** banded edges across the grain (0–2) */
  bandShort: number;
}

export const DEFAULT_BOARD: BoardData = { grain: 'length', bandLong: 0, bandShort: 0 };

/** one board as found in the model: its sizes in metres (any order) */
export interface BoardItem {
  name: string;
  material: string;
  size: [number, number, number];
  board: BoardData;
}

/** a line of the cut list: equal boards counted together; length is the side along the grain */
export interface CutRow {
  name: string;
  material: string;
  count: number;
  length: number;
  width: number;
  thickness: number;
  bandLong: number;
  bandShort: number;
  /** edge banding of all boards of the row, in metres */
  banding: number;
}

/** the three sides of a board: thickness is the smallest, length the one along the grain */
export const boardSides = (size: [number, number, number], grain: BoardData['grain']) => {
  const [longest, middle, thickness] = [...size].sort((a, b) => b - a);
  return grain === 'length' ? { length: longest, width: middle, thickness } : { length: middle, width: longest, thickness };
};

const millimetres = (metres: number) => Math.round(metres * 10000) / 10;

export const cutList = (items: BoardItem[]): CutRow[] => {
  const rows = new Map<string, CutRow>();
  for (const item of items) {
    const sides = boardSides(item.size, item.board.grain);
    const bandLong = Math.min(2, Math.max(0, Math.round(item.board.bandLong)));
    const bandShort = Math.min(2, Math.max(0, Math.round(item.board.bandShort)));
    const key = [
      item.name,
      item.material,
      millimetres(sides.length),
      millimetres(sides.width),
      millimetres(sides.thickness),
      bandLong,
      bandShort,
    ].join('|');
    const row = rows.get(key) ?? { name: item.name, material: item.material, count: 0, ...sides, bandLong, bandShort, banding: 0 };
    row.count++;
    row.banding += bandLong * sides.length + bandShort * sides.width;
    rows.set(key, row);
  }
  return [...rows.values()].sort(
    (a, b) => a.material.localeCompare(b.material) || b.thickness - a.thickness || a.name.localeCompare(b.name),
  );
};

const csvCell = (value: string | number) => {
  const text = String(value);
  return /[;"\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};

/** the cut list as CSV for spreadsheets (semicolons, sizes in mm, BOM so Excel reads the umlauts) */
export const cutListCsv = (rows: CutRow[], header: string[]) => {
  const lines: (string | number)[][] = [header];
  for (const row of rows) {
    lines.push([
      row.name,
      row.material,
      row.count,
      millimetres(row.length),
      millimetres(row.width),
      millimetres(row.thickness),
      row.bandLong,
      row.bandShort,
      millimetres(row.banding),
    ]);
  }
  return '﻿' + lines.map((line) => line.map(csvCell).join(';')).join('\r\n');
};
