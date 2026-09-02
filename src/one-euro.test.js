import { describe, expect, test } from 'vitest';
import { OneEuroFilter } from './one-euro';

const DT = 1 / 30;

// Feed `values` at a fixed frame rate and return every output.
function run(filter, values, { dt = DT, valueScale = 1, t0 = 0 } = {}) {
  return values.map((v, i) => filter.filter(v, t0 + i * dt, valueScale));
}

describe('OneEuroFilter', () => {
  test('the first sample after construction or reset() passes through unchanged', () => {
    const f = new OneEuroFilter({ minCutoff: 0.05, beta: 80 });
    expect(f.filter(3.5, 0)).toBe(3.5);
    f.filter(9, DT);
    f.reset();
    expect(f.filter(-1.25, 2 * DT)).toBe(-1.25);
  });

  test('a constant input returns that constant', () => {
    const f = new OneEuroFilter({ minCutoff: 0.05, beta: 80 });
    for (const out of run(f, new Array(50).fill(0.42))) expect(out).toBeCloseTo(0.42, 12);
  });

  // Samples needed for a 0 → 1 step to settle within `tolerance` of 1.
  function settleTime(filter, tolerance = 0.01, valueScale = 1) {
    filter.filter(0, 0, valueScale);
    for (let i = 1; i < 10000; i++) {
      const out = filter.filter(1, i * DT, valueScale);
      if (Math.abs(out - 1) < tolerance) return i;
    }
    return Infinity;
  }

  test('a step converges, faster with a larger minCutoff', () => {
    const slow = settleTime(new OneEuroFilter({ minCutoff: 0.5, beta: 0 }));
    const fast = settleTime(new OneEuroFilter({ minCutoff: 5, beta: 0 }));
    expect(fast).toBeLessThan(slow);
    expect(slow).toBeLessThan(Infinity);
  });

  test('a faster-moving input (larger beta effect) converges faster', () => {
    // Same filter, same step: only the velocity differs (1 vs 10 per frame).
    const f = new OneEuroFilter({ minCutoff: 0.05, beta: 1 });
    const small = run(f, [0, 1, 1, 1, 1]);
    f.reset();
    const large = run(f, [0, 10, 10, 10, 10]);
    // Relative distance to the target after the same number of frames.
    expect(Math.abs(large[4] - 10) / 10).toBeLessThan(Math.abs(small[4] - 1) / 1);
  });

  test('valueScale changes the adaptive cutoff but not the steady-state output', () => {
    const f = new OneEuroFilter({ minCutoff: 0.05, beta: 1 });
    const unscaled = run(f, [0, 1, 1, 1]);
    f.reset();
    const scaled = run(f, [0, 1, 1, 1], { valueScale: 100 });
    expect(scaled[1]).toBeGreaterThan(unscaled[1]); // higher cutoff, follows the step closer
    f.reset();
    const settled = run(f, new Array(2000).fill(1), { valueScale: 100 });
    expect(settled[1999]).toBeCloseTo(1, 6);
  });

  test('a larger dt moves the output further per sample (no fixed frame rate)', () => {
    const f = new OneEuroFilter({ minCutoff: 0.5, beta: 0 });
    f.filter(0, 0);
    const oneFrame = f.filter(1, DT);
    f.reset();
    f.filter(0, 0);
    const twoFrames = f.filter(1, 2 * DT);
    expect(twoFrames).toBeGreaterThan(oneFrame);
  });

  test('a sample that does not advance time passes through and leaves the state alone', () => {
    const f = new OneEuroFilter({ minCutoff: 0.5, beta: 0 });
    f.filter(0, 0);
    const before = f.filter(1, DT);
    expect(f.filter(5, DT)).toBe(5);
    const g = new OneEuroFilter({ minCutoff: 0.5, beta: 0 });
    g.filter(0, 0);
    g.filter(1, DT);
    expect(f.filter(1, 2 * DT)).toBe(g.filter(1, 2 * DT));
    expect(before).toBeLessThan(1);
  });
});
