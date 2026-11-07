import assert from 'node:assert/strict';
import { test } from 'node:test';
import { catalogPart } from '../src/catalog.ts';
import { cleanReference, collectPlacements, flattenPart, LdrawError, parseColours, splitModel } from '../src/ldraw.ts';
import { OWN_MODEL_NAMES, OWN_MODELS } from '../src/ownModels.ts';

const COLOURS = '0 !COLOUR Red CODE 4 VALUE #C91A09 EDGE #333333\n0 !COLOUR Glass CODE 47 VALUE #FCFCFC EDGE #C3C3C3 ALPHA 128\n';

test('a colour table gives colours, with what lets light through', () => {
  const colours = parseColours(COLOURS);
  assert.equal(colours.get('4'), '#c91a09');
  assert.equal(colours.get('47'), '#fcfcfc80');
});

test('a plain file is its own model', () => {
  const split = splitModel('0 Car\n1 4 0 0 0 1 0 0 0 1 0 0 0 1 3001.DAT\n');
  const [only] = collectPlacements(split, parseColours(COLOURS));
  assert.equal(only.part, '3001.dat');
  assert.equal(only.color, '#c91a09');
});

test('sub-models hand on their place and colour', () => {
  const text = [
    '0 FILE main.ldr',
    '1 4 10 0 0 1 0 0 0 1 0 0 0 1 Wheel.ldr',
    '0 NOFILE',
    '0 FILE wheel.ldr',
    '1 16 5 0 0 1 0 0 0 1 0 0 0 1 3001.dat',
    '1 47 0 0 0 1 0 0 0 1 0 0 0 1 3002.dat',
    '0 NOFILE',
  ].join('\n');
  const placements = collectPlacements(splitModel(text), parseColours(COLOURS));
  assert.deepEqual(
    placements.map(({ part, color, transform }) => [part, color, transform[0]]),
    [
      ['3001.dat', '#c91a09', 15],
      ['3002.dat', '#fcfcfc80', 10],
    ],
  );
});

test('a packed file starts with its colours, and parts come inside it under their folders', () => {
  const text = `${COLOURS}0 Car\n1 4 0 0 0 1 0 0 0 1 0 0 0 1 parts/3001.dat\n0 FILE parts/3001.dat\n0 Brick\n0 !LDRAW_ORG Part\n3 16 0 0 0 20 0 0 0 0 20\n`;
  const split = splitModel(text);
  assert.equal(collectPlacements(split, parseColours(text))[0].part, '3001.dat');
  assert.ok(split.parts.has('3001.dat'));
  assert.ok(!split.models.get(split.main)?.includes('!COLOUR'));
});

test('a colour can be spelled out', () => {
  const placements = collectPlacements(splitModel('1 0x2FF8800 0 0 0 1 0 0 0 1 0 0 0 1 3001.dat'), new Map());
  assert.equal(placements[0].color, '#ff8800');
});

test('references out of the library do not become placements', () => {
  const placements = collectPlacements(
    splitModel('1 4 0 0 0 1 0 0 0 1 0 0 0 1 ../../x.dat\n1 4 0 0 0 1 0 0 0 1 0 0 0 1 3001.dat'),
    new Map(),
  );
  assert.deepEqual(placements.map(({ part }) => part), ['3001.dat']);
  assert.equal(cleanReference('parts/s/3001s01.dat'), 's/3001s01.dat');
});

test('a model that refers to itself ends', () => {
  const loop = '0 FILE a.ldr\n1 4 0 0 0 1 0 0 0 1 0 0 0 1 a.ldr\n1 4 0 0 0 1 0 0 0 1 0 0 0 1 3001.dat\n';
  assert.ok(collectPlacements(splitModel(loop), new Map()).length > 0);
});

test('a model that grows without end stops at the limit', () => {
  const level = (name: string, next: string) => `0 FILE ${name}\n${`1 4 0 0 0 1 0 0 0 1 0 0 0 1 ${next}\n`.repeat(50)}`;
  const text = [level('a.ldr', 'b.ldr'), level('b.ldr', 'c.ldr'), level('c.ldr', 'd.ldr'), level('d.ldr', '3001.dat')].join('');
  assert.throws(
    () => collectPlacements(splitModel(text), new Map()),
    (error: LdrawError) => error.code === 'tooLarge',
  );
});

test('a file without parts is an error', () => {
  assert.throws(
    () => collectPlacements(splitModel('0 nothing here'), new Map()),
    (error: LdrawError) => error.code === 'noGeometry',
  );
});

test('a part knows how it was centred, so a model can put it back', () => {
  // from x = 0 to 40, y = 0 to 24, z = 0 to 20 in LDraw units
  const box = '4 16 0 0 0 40 0 0 40 0 20 0 0 20\n4 16 0 24 0 40 24 0 40 24 20 0 24 20\n';
  const part = flattenPart('box.dat', new Map([['box.dat', box]]));
  const near = (a: number, b: number) => assert.ok(Math.abs(a - b) < 1e-9, `${a} ${b}`);
  near(part.origin[0], -20 * 0.0004);
  near(part.origin[1], -10 * 0.0004);
  near(part.origin[2], 24 * 0.0004);
});

test('own models use existing parts, and no two bricks take the same space', () => {
  for (const name of OWN_MODEL_NAMES) {
    const placed = OWN_MODELS[name]().map((placement) => {
      const part = catalogPart(placement.part);
      assert.ok(part, `${name}: ${placement.part}`);
      const [w, d] = placement.rotation % 180 === 0 ? [part.w, part.d] : [part.d, part.w];
      return {
        x0: placement.x - w / 2,
        x1: placement.x + w / 2,
        y0: placement.y - d / 2,
        y1: placement.y + d / 2,
        z0: placement.z,
        z1: placement.z + part.height,
      };
    });
    assert.ok(placed.length > 1, name);
    placed.forEach((a, i) => {
      placed.slice(i + 1).forEach((b) => {
        const overlaps = a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1 && a.z0 < b.z1 - 1e-9 && b.z0 < a.z1 - 1e-9;
        assert.ok(!overlaps, name);
      });
    });
    // a cell's middle is whole or half: everything sits on the grid
    for (const placement of OWN_MODELS[name]()) {
      assert.ok(Number.isInteger(placement.x * 2) && Number.isInteger(placement.y * 2), name);
    }
  }
});
