import { describe, expect, it } from 'vitest';
import { cellular, fractal, heightField, HEIGHT_DEFAULTS, randomGenerator, simplex, terrace } from '../src';

describe('randomGenerator', () => {
  it('gives the same numbers for the same seed, others for another', () => {
    const first = randomGenerator(7),
      second = randomGenerator(7),
      other = randomGenerator(8);
    const numbers = Array.from({ length: 20 }, () => first());
    expect(Array.from({ length: 20 }, () => second())).toEqual(numbers);
    expect(Array.from({ length: 20 }, () => other())).not.toEqual(numbers);
  });

  it('stays in 0 … 1', () => {
    const random = randomGenerator(1);
    for (let index = 0; index < 1000; index++) {
      const value = random();
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
  });
});

describe('simplex', () => {
  it('is deterministic per seed and stays in −1 … 1', () => {
    const noise = simplex(3),
      again = simplex(3),
      other = simplex(4);
    let differs = false;
    for (let index = 0; index < 200; index++) {
      const x = index * 0.37,
        y = index * 0.71;
      const value = noise.noise2(x, y);
      expect(value).toBe(again.noise2(x, y));
      expect(Math.abs(value)).toBeLessThanOrEqual(1);
      expect(Math.abs(noise.noise3(x, y, index * 0.13))).toBeLessThanOrEqual(1);
      differs ||= value !== other.noise2(x, y);
    }
    expect(differs).toBe(true);
  });
});

describe('fractal', () => {
  it('gives the same value for the same input in every mode', () => {
    for (const mode of ['fbm', 'ridged', 'billow'] as const) {
      const value = fractal(1.3, 2.7, undefined, { seed: 5, octaves: 5, mode });
      expect(fractal(1.3, 2.7, undefined, { seed: 5, octaves: 5, mode })).toBe(value);
      expect(Number.isFinite(value)).toBe(true);
    }
  });
});

describe('heightField and terrace', () => {
  it('samples the same heights twice', () => {
    const field = heightField({ ...HEIGHT_DEFAULTS, seed: 9 }, 50, 30);
    const again = heightField({ ...HEIGHT_DEFAULTS, seed: 9 }, 50, 30);
    for (const [x, y] of [
      [0, 0],
      [12.5, 7],
      [50, 30],
    ]) {
      expect(field(x, y)).toBe(again(x, y));
    }
  });

  it('pulls heights to the nearest step, the more the sharper', () => {
    expect(terrace(2.3, 1, 1)).toBeCloseTo(2, 1);
    expect(terrace(2.8, 1, 1)).toBeCloseTo(3, 1);
    expect(terrace(2.5, 1, 1)).toBeCloseTo(2.5, 6);
    expect(Math.abs(terrace(2.3, 1, 1) - 2)).toBeLessThan(Math.abs(terrace(2.3, 1, 0) - 2));
  });
});

describe('cellular', () => {
  it('has the nearest site no farther than the second nearest', () => {
    for (let index = 0; index < 100; index++) {
      const sample = cellular(index * 0.31, index * 0.17, 2);
      expect(sample.f1).toBeLessThanOrEqual(sample.f2);
      expect(sample.id).toBeGreaterThanOrEqual(0);
      expect(sample.id).toBeLessThanOrEqual(1);
    }
  });
});
