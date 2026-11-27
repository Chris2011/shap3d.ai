// Self-check of the variable expressions – run with: node scripts/checks/variables.check.mts
import assert from 'node:assert/strict';
import { evaluateExpression } from '../../src/core/variables.ts';
const FACT = { mm: 0.001, cm: 0.01, m: 1, km: 1000, in: 0.0254, '"': 0.0254, ft: 0.3048, "'": 0.3048 };
const vars = [
  { name: 'wand', value: '240 mm' },
  { name: 'doppelt', value: '#wand * 2' },
  { name: 'schleife', value: '#schleife + 1' },
  { name: 'anzahl', value: '4' },
];
const ev = (text, unit = 'mm') => evaluateExpression(text, FACT, unit, vars);
const near = (result, value, length) => {
  assert.ok(result, 'null');
  assert.ok(Math.abs(result.value - value) < 1e-9, `${result.value} != ${value}`);
  assert.equal(result.length, length);
};
near(ev('#wand'), 0.24, true);
near(ev('#wand * 2'), 0.48, true);
near(ev('2 * #wand + 10 cm'), 0.58, true);
near(ev('#doppelt / 4'), 0.12, true);
near(ev('#wand + 10'), 0.25, true); // bare 10 in model units (mm)
near(ev('(#wand + 1 m) * 0,5'.replace(',', '.')), 0.62, true);
near(ev('-#wand'), -0.24, true);
near(ev('#anzahl'), 4, false);
near(ev('#wand / #wand'), 1, false);
assert.equal(ev('#wand * #wand'), null); // area is no length
assert.equal(ev('#schleife'), null); // refers to itself
assert.equal(ev('#fehlt + 1 m'), null); // unknown
assert.equal(ev('2 +'), null);
assert.equal(ev('alert(1)'), null); // no code
assert.equal(ev('1 m / 0'), null);
near(ev('3 ft + 6 in', 'm'), 1.0668, true);
console.log('variables: all checks passed');
