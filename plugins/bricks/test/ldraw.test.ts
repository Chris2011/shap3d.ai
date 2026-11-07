import assert from 'node:assert/strict';
import { test } from 'node:test';
import { cleanReference, flattenPart, headerOf, isPartNumber, LdrawError, neutralTitle, referencesOf } from '../src/ldraw.ts';

// a closed box 40 × 24 × 20 LDU with its faces looking outwards, in LDraw's coordinates (Y down, the top at y = 0)
const BOX = `0 Test box
0 Name: box.dat
0 Author: A. Author
0 !LICENSE Licensed under CC BY 4.0
0 BFC CERTIFY CCW
4 16 -20 0 -10 20 0 -10 20 0 10 -20 0 10
4 16 -20 24 10 20 24 10 20 24 -10 -20 24 -10
4 16 -20 0 10 20 0 10 20 24 10 -20 24 10
4 16 20 0 -10 -20 0 -10 -20 24 -10 20 24 -10
4 16 20 0 10 20 0 -10 20 24 -10 20 24 10
4 16 -20 0 -10 -20 0 10 -20 24 10 -20 24 -10
`;

const signedVolume = (vertices: number[][], faces: number[][]) => {
  let volume = 0;
  for (const face of faces) {
    const a = vertices[face[0]];
    for (let i = 1; i < face.length - 1; i++) {
      const b = vertices[face[i]];
      const c = vertices[face[i + 1]];
      volume += a[0] * (b[1] * c[2] - b[2] * c[1]) - a[1] * (b[0] * c[2] - b[2] * c[0]) + a[2] * (b[0] * c[1] - b[1] * c[0]);
    }
  }
  return volume / 6;
};

const mm = 0.001;

test('a part keeps its size in metres, stands on the ground and is centred', () => {
  const part = flattenPart('box.dat', new Map([['box.dat', BOX]]));
  assert.deepEqual([part.w, part.d], [2, 1]);
  assert.ok(Math.abs(part.height - 9.6 * mm) < 1e-9);
  const zs = part.vertices.map((point) => point[2]);
  assert.ok(Math.abs(Math.min(...zs)) < 1e-9);
  assert.ok(Math.abs(Math.max(...zs) - 9.6 * mm) < 1e-9);
  assert.ok(Math.abs(Math.max(...part.vertices.map((point) => point[0])) - 8 * mm) < 1e-9);
});

test('what looks outwards in LDraw looks outwards here', () => {
  const part = flattenPart('box.dat', new Map([['box.dat', BOX]]));
  assert.ok(signedVolume(part.vertices, part.faces) > 0);
});

test('a reference inverted with BFC and a mirrored one both keep the winding the library means', () => {
  const inverted = '0 BFC CERTIFY CCW\n0 BFC INVERTNEXT\n1 16 0 0 0 1 0 0 0 1 0 0 0 1 box.dat\n';
  const mirrored = '0 BFC CERTIFY CCW\n1 16 0 0 0 -1 0 0 0 1 0 0 0 1 box.dat\n';
  const files = new Map([
    ['box.dat', BOX],
    ['inverted.dat', inverted],
    ['mirrored.dat', mirrored],
  ]);
  const inside = flattenPart('inverted.dat', files);
  assert.ok(signedVolume(inside.vertices, inside.faces) < 0);
  const outside = flattenPart('mirrored.dat', files);
  assert.ok(signedVolume(outside.vertices, outside.faces) > 0);
});

test('references go through a transformation', () => {
  const twice = '1 16 0 0 0 2 0 0 0 1 0 0 0 1 box.dat\n';
  const part = flattenPart('twice.dat', new Map([['box.dat', BOX], ['twice.dat', twice]]));
  assert.deepEqual([part.w, part.d], [4, 1]);
});

test('references that try to leave the library are refused', () => {
  assert.equal(cleanReference('s\\3001s01.dat'), 's/3001s01.dat');
  assert.equal(cleanReference('48\\4-4cyli.dat'), '48/4-4cyli.dat');
  assert.equal(cleanReference('../../secret.dat'), null);
  assert.equal(cleanReference('/etc/passwd.dat'), null);
  assert.equal(cleanReference('https://example.org/x.dat'), null);
  assert.equal(cleanReference('stud.exe'), null);
  assert.deepEqual(referencesOf('1 16 0 0 0 1 0 0 0 1 0 0 0 1 ..\\x.dat\n1 16 0 0 0 1 0 0 0 1 0 0 0 1 Stud.DAT'), ['stud.dat']);
});

test('a file that refers to itself ends', () => {
  const loop = '3 16 0 0 0 20 0 0 0 0 20\n1 16 0 0 0 1 0 0 0 1 0 0 0 1 loop.dat\n';
  const part = flattenPart('loop.dat', new Map([['loop.dat', loop]]));
  assert.ok(part.faces.length > 1);
});

test('a part that would never end stops at the limit', () => {
  const lines = (name: string) => Array.from({ length: 40 }, () => `1 16 0 0 0 1 0 0 0 1 0 0 0 1 ${name}`).join('\n');
  const files = new Map([
    ['a.dat', lines('b.dat')],
    ['b.dat', lines('c.dat')],
    ['c.dat', lines('d.dat')],
    ['d.dat', '3 16 0 0 0 20 0 0 0 0 20\n'.repeat(10)],
  ]);
  assert.throws(() => flattenPart('a.dat', files), (error: LdrawError) => error.code === 'tooLarge');
});

test('nothing to draw is an error, not an empty brick', () => {
  assert.throws(() => flattenPart('empty.dat', new Map([['empty.dat', '0 nothing']])), (error: LdrawError) => error.code === 'noGeometry');
});

test('the header says what it is and whose', () => {
  const header = headerOf(BOX);
  assert.equal(header.title, 'Test box');
  assert.equal(header.author, 'A. Author');
  assert.equal(header.license, 'Licensed under CC BY 4.0');
});

test('brand names do not reach the texts', () => {
  assert.equal(neutralTitle('Technic Brick  1 x  2 with Hole'), 'Brick 1 x 2 with Hole');
  assert.equal(neutralTitle('LEGO® Brick'), 'Brick');
  assert.equal(neutralTitle('Minifig Head'), 'Figure Head');
});

test('part numbers are plain', () => {
  assert.ok(isPartNumber('3001'));
  assert.ok(isPartNumber('3070b'));
  assert.ok(!isPartNumber('../3001'));
  assert.ok(!isPartNumber('a b'));
  assert.ok(!isPartNumber(''));
});
