import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DEFAULT_SHEET, nest, type Piece, type Placed } from '../src/nesting.ts';

const overlaps = (a: Placed, b: Placed) => a.x < b.x + b.sizeX - 1e-9 && b.x < a.x + a.sizeX - 1e-9 && a.y < b.y + b.sizeY - 1e-9 && b.y < a.y + a.sizeY - 1e-9;

/** every piece on its sheet, inside the trimmed edge, none on top of another */
const checkSheets = (sheets: { pieces: Placed[] }[], settings = DEFAULT_SHEET) => {
  for (const sheet of sheets) {
    for (const piece of sheet.pieces) {
      assert.ok(piece.x >= settings.trim - 1e-9 && piece.y >= settings.trim - 1e-9, `${piece.name} over the trim`);
      assert.ok(piece.x + piece.sizeX <= settings.length - settings.trim + 1e-9, `${piece.name} off the sheet (x)`);
      assert.ok(piece.y + piece.sizeY <= settings.width - settings.trim + 1e-9, `${piece.name} off the sheet (y)`);
    }
    sheet.pieces.forEach((a, index) => sheet.pieces.slice(index + 1).forEach((b) => assert.ok(!overlaps(a, b), `${a.name} on ${b.name}`)));
  }
};

test('a bookcase fits on one sheet, every piece along the grain', () => {
  const pieces: Piece[] = [
    { name: 'Side', length: 1.5, width: 0.3 },
    { name: 'Side', length: 1.5, width: 0.3 },
    { name: 'Top', length: 0.762, width: 0.3 },
    { name: 'Bottom', length: 0.762, width: 0.3 },
    { name: 'Shelf', length: 0.76, width: 0.28 },
    { name: 'Shelf', length: 0.76, width: 0.28 },
  ];
  const { sheets, tooBig } = nest(pieces, DEFAULT_SHEET);
  assert.equal(sheets.length, 1);
  assert.equal(tooBig.length, 0);
  assert.equal(sheets[0].pieces.length, 6);
  assert.ok(sheets[0].pieces.every((piece) => !piece.turned));
  checkSheets(sheets);
  const area = pieces.reduce((sum, piece) => sum + piece.length * piece.width, 0);
  assert.ok(Math.abs(sheets[0].usage - area / (2.8 * 2.07)) < 1e-9);
});

test('more pieces than one sheet holds go on further sheets', () => {
  const pieces = Array.from({ length: 30 }, (_, index) => ({ name: `Panel ${index}`, length: 0.9, width: 0.6 }));
  const { sheets } = nest(pieces, DEFAULT_SHEET);
  // 3 across the length (3 × 0.904 ≤ 2.78), 3 strips across the width (3 × 0.604 ≤ 2.05): 9 per sheet
  assert.equal(sheets.length, 4);
  assert.equal(sheets.reduce((sum, sheet) => sum + sheet.pieces.length, 0), 30);
  checkSheets(sheets);
});

test('without the grain rule a piece too long across turns; with it, it is too big', () => {
  const settings = { ...DEFAULT_SHEET, length: 1, width: 2, grain: true };
  const piece = { name: 'Long', length: 1.8, width: 0.4 };
  assert.equal(nest([piece], settings).tooBig.length, 1);
  const free = nest([piece], { ...settings, grain: false });
  assert.equal(free.tooBig.length, 0);
  assert.equal(free.sheets[0].pieces[0].turned, true);
  checkSheets(free.sheets, { ...settings, grain: false });
});
