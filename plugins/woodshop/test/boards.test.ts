// Checks of the cut list – run with: npm test (node --test test/*.test.ts)
import assert from 'node:assert/strict';
import { boardSides, cutList, cutListCsv, type BoardItem } from '../src/boards.ts';

// thickness is the smallest side; length follows the grain
assert.deepEqual(boardSides([0.6, 0.018, 2], 'length'), { length: 2, width: 0.6, thickness: 0.018 });
assert.deepEqual(boardSides([0.6, 0.018, 2], 'width'), { length: 0.6, width: 2, thickness: 0.018 });

const shelf = (size: [number, number, number], bandLong = 1): BoardItem => ({
  name: 'Shelf',
  material: 'Oak',
  size,
  board: { grain: 'length', bandLong, bandShort: 0 },
});
const rows = cutList([
  shelf([0.8, 0.3, 0.019]),
  shelf([0.3, 0.019, 0.8]), // the same board turned: counted with the first
  shelf([0.8, 0.3, 0.019], 2), // other banding: its own row
  { name: 'Side', material: 'Birch', size: [0.018, 0.4, 1.8], board: { grain: 'length', bandLong: 5, bandShort: -1 } },
]);
assert.equal(rows.length, 3);
// sorted by material: Birch first, banding clamped to 0–2
assert.equal(rows[0].name, 'Side');
assert.equal(rows[0].bandLong, 2);
assert.equal(rows[0].bandShort, 0);
assert.ok(Math.abs(rows[0].banding - 3.6) < 1e-9);
const pair = rows.find((row) => row.count === 2)!;
assert.ok(pair && Math.abs(pair.banding - 1.6) < 1e-9, 'two shelves with one banded long edge: 2 × 0.8 m');

// CSV: header, millimetres, quoting
const csv = cutListCsv([{ ...rows[0], name: 'Side; "left"' }], ['Name', 'Material', 'Count', 'L', 'W', 'T', 'BL', 'BS', 'Banding']);
const lines = csv.replace('﻿', '').split('\r\n');
assert.equal(lines.length, 2);
assert.equal(lines[1], '"Side; ""left""";Birch;1;1800;400;18;2;0;3600');
console.log('woodshop: all checks passed');
