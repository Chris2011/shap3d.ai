import assert from 'node:assert/strict';
import { test } from 'node:test';
import { interleave } from '../src/source.ts';

test('interleave takes a card from each list in turn, and keeps all', () => {
  assert.deepEqual(interleave([[1, 2, 3], [4], [], [5, 6]]), [1, 4, 5, 2, 6, 3]);
  assert.deepEqual(interleave([]), []);
});
