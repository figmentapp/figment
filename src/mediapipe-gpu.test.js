import { beforeAll, describe, expect, test, vi } from 'vitest';

// mediapipe-gpu.js imports figment.js, which touches GPU globals at module
// scope — stub them before importing (same approach as figment.test.js).
let mp;
beforeAll(async () => {
  vi.stubGlobal('window', {});
  vi.stubGlobal('AudioContext', class AudioContext {});
  vi.stubGlobal('GPUBufferUsage', { COPY_DST: 8, MAP_READ: 1, STORAGE: 128, COPY_SRC: 4 });
  vi.stubGlobal('GPUMapMode', { READ: 1 });
  vi.stubGlobal('GPUTextureUsage', {
    TEXTURE_BINDING: 1,
    RENDER_ATTACHMENT: 2,
    COPY_SRC: 4,
    COPY_DST: 8,
    STORAGE_BINDING: 16,
  });
  mp = await import('./mediapipe-gpu');
});

describe('generateAnchors', () => {
  test('produces the 2254 anchors of the pose detector, in layer order', () => {
    const anchors = mp.generateAnchors();
    expect(anchors.length).toBe(2254 * 2);

    // Layer 1 (stride 8): 28×28 cells × 2 anchors. First cell center is (0.5/28, 0.5/28).
    expect(anchors[0]).toBeCloseTo(0.5 / 28, 6);
    expect(anchors[1]).toBeCloseTo(0.5 / 28, 6);
    // Both anchors of a cell share the same center.
    expect(anchors[2]).toBe(anchors[0]);
    expect(anchors[3]).toBe(anchors[1]);
    // Second cell advances x by 1/28.
    expect(anchors[4]).toBeCloseTo(1.5 / 28, 6);

    // Layer 2 (stride 16) starts after 28×28×2 anchors: center (0.5/14, 0.5/14).
    const l2 = 28 * 28 * 2 * 2;
    expect(anchors[l2]).toBeCloseTo(0.5 / 14, 6);
    expect(anchors[l2 + 1]).toBeCloseTo(0.5 / 14, 6);

    // Layer 3 (strides 32,32,32 merged): 7×7 cells × 6 anchors each.
    const l3 = l2 + 14 * 14 * 2 * 2;
    for (let a = 0; a < 6; a++) {
      expect(anchors[l3 + a * 2]).toBeCloseTo(0.5 / 7, 6);
      expect(anchors[l3 + a * 2 + 1]).toBeCloseTo(0.5 / 7, 6);
    }
    // Last anchor is the last cell of the 7×7 map.
    expect(anchors[anchors.length - 2]).toBeCloseTo(6.5 / 7, 6);
    expect(anchors[anchors.length - 1]).toBeCloseTo(6.5 / 7, 6);
  });
});

describe('normalizeRadians', () => {
  test('wraps angles into [-π, π)', () => {
    expect(mp.normalizeRadians(0)).toBeCloseTo(0, 9);
    expect(mp.normalizeRadians(Math.PI * 2)).toBeCloseTo(0, 9);
    expect(mp.normalizeRadians(Math.PI * 2.5)).toBeCloseTo(Math.PI / 2, 9);
    expect(mp.normalizeRadians(-Math.PI * 2.5)).toBeCloseTo(-Math.PI / 2, 9);
  });
});

describe('roiFromKeypoints', () => {
  test('upright pose (alignment point above center) has zero rotation', () => {
    // Mid-hip at frame center, alignment point straight up.
    const roi = mp.roiFromKeypoints({ x: 0.5, y: 0.5 }, { x: 0.5, y: 0.3 }, 100, 100);
    expect(roi.cx).toBeCloseTo(50, 6);
    expect(roi.cy).toBeCloseTo(50, 6);
    expect(roi.rotation).toBeCloseTo(0, 6);
    // Distance is 20 px → box 40 px → ×1.25 scale = 50 px.
    expect(roi.size).toBeCloseTo(50, 6);
  });

  test('alignment point to the right yields +90° rotation', () => {
    const roi = mp.roiFromKeypoints({ x: 0.5, y: 0.5 }, { x: 0.7, y: 0.5 }, 100, 100);
    expect(roi.rotation).toBeCloseTo(Math.PI / 2, 6);
  });

  test('distances are computed in pixel space for non-square frames', () => {
    // Same normalized offset, but the frame is twice as wide: the pixel
    // distance doubles when the offset is horizontal.
    const a = mp.roiFromKeypoints({ x: 0.5, y: 0.5 }, { x: 0.6, y: 0.5 }, 100, 100);
    const b = mp.roiFromKeypoints({ x: 0.5, y: 0.5 }, { x: 0.6, y: 0.5 }, 200, 100);
    expect(b.size).toBeCloseTo(a.size * 2, 6);
  });
});
