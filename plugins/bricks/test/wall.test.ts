import assert from 'node:assert/strict';
import { test } from 'node:test';
import { wallPieces } from '../src/wall.ts';

/** which studs of a row are taken, and by how many pieces each */
const cover = (pieces: ReturnType<typeof wallPieces>, row: number, length: number) => {
  const taken = new Array(length).fill(0);
  for (const piece of pieces.filter((piece) => piece.row === row)) {
    for (let stud = piece.start; stud < piece.start + piece.size; stud++) {
      taken[stud]++;
    }
  }
  return taken;
};

test('every stud of every row is taken once', () => {
  for (const length of [1, 2, 3, 5, 8, 12, 13]) {
    const pieces = wallPieces(length, 4);
    for (let row = 0; row < 4; row++) {
      assert.deepEqual(cover(pieces, row, length), new Array(length).fill(1), `length ${length} row ${row}`);
    }
  }
});

test('joints shift from row to row', () => {
  const joints = (row: number) =>
    wallPieces(12, 2)
      .filter((piece) => piece.row === row && piece.start > 0)
      .map((piece) => piece.start);
  assert.deepEqual(joints(0), [4, 8]);
  assert.ok(joints(1).every((joint) => !joints(0).includes(joint)));
});

test('an opening stays free in its rows only', () => {
  const pieces = wallPieces(12, 7, [{ at: 4, width: 4, from: 0, rows: 6 }]);
  for (let row = 0; row < 6; row++) {
    assert.deepEqual(cover(pieces, row, 12).slice(4, 8), [0, 0, 0, 0], `row ${row}`);
    assert.ok(cover(pieces, row, 12).every((count, stud) => (stud >= 4 && stud < 8) || count === 1), `row ${row}`);
  }
  assert.deepEqual(cover(pieces, 6, 12), new Array(12).fill(1));
});
