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

describe('generateSsdAnchors', () => {
  test('pose detector: 2254 anchors (224, strides 8,16,32,32,32)', () => {
    const anchors = mp.generateSsdAnchors({ inputSize: 224, strides: [8, 16, 32, 32, 32] });
    expect(anchors.length).toBe(2254 * 2);

    // Layer 1 (stride 8): 28×28 cells × 2 anchors, first center (0.5/28, 0.5/28).
    expect(anchors[0]).toBeCloseTo(0.5 / 28, 6);
    expect(anchors[1]).toBeCloseTo(0.5 / 28, 6);
    // Both anchors of a cell share the same center; second cell advances x.
    expect(anchors[2]).toBe(anchors[0]);
    expect(anchors[4]).toBeCloseTo(1.5 / 28, 6);

    // Layer 2 (stride 16) starts after 28×28×2 anchors.
    const l2 = 28 * 28 * 2 * 2;
    expect(anchors[l2]).toBeCloseTo(0.5 / 14, 6);

    // Layers 3-5 (stride 32, merged): 7×7 cells × 6 anchors each.
    const l3 = l2 + 14 * 14 * 2 * 2;
    for (let a = 0; a < 6; a++) {
      expect(anchors[l3 + a * 2]).toBeCloseTo(0.5 / 7, 6);
    }
    expect(anchors[anchors.length - 2]).toBeCloseTo(6.5 / 7, 6);
  });

  test('hand detector: 2016 anchors (192, strides 8,16,16,16)', () => {
    const anchors = mp.generateSsdAnchors({ inputSize: 192, strides: [8, 16, 16, 16] });
    // 24×24×2 + 12×12×6 = 1152 + 864
    expect(anchors.length).toBe(2016 * 2);
    const l2 = 24 * 24 * 2 * 2;
    expect(anchors[l2]).toBeCloseTo(0.5 / 12, 6);
    // Merged stride-16 layers: 6 anchors per cell.
    for (let a = 0; a < 6; a++) {
      expect(anchors[l2 + a * 2]).toBeCloseTo(0.5 / 12, 6);
    }
  });

  test('face detector: 896 anchors (128, strides 8,16,16,16)', () => {
    const anchors = mp.generateSsdAnchors({ inputSize: 128, strides: [8, 16, 16, 16] });
    // 16×16×2 + 8×8×6 = 512 + 384
    expect(anchors.length).toBe(896 * 2);
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

describe('roiFromAlignmentPoints', () => {
  test('upright pose (alignment point above center) has zero rotation', () => {
    const roi = mp.roiFromAlignmentPoints({ x: 0.5, y: 0.5 }, { x: 0.5, y: 0.3 }, 100, 100, 1.25);
    expect(roi.cx).toBeCloseTo(50, 6);
    expect(roi.cy).toBeCloseTo(50, 6);
    expect(roi.rotation).toBeCloseTo(0, 6);
    // Distance is 20 px → box 40 px → ×1.25 scale = 50 px.
    expect(roi.size).toBeCloseTo(50, 6);
  });

  test('alignment point to the right yields +90° rotation', () => {
    const roi = mp.roiFromAlignmentPoints({ x: 0.5, y: 0.5 }, { x: 0.7, y: 0.5 }, 100, 100, 1.25);
    expect(roi.rotation).toBeCloseTo(Math.PI / 2, 6);
  });

  test('distances are computed in pixel space for non-square frames', () => {
    const a = mp.roiFromAlignmentPoints({ x: 0.5, y: 0.5 }, { x: 0.6, y: 0.5 }, 100, 100, 1.25);
    const b = mp.roiFromAlignmentPoints({ x: 0.5, y: 0.5 }, { x: 0.6, y: 0.5 }, 200, 100, 1.25);
    expect(b.size).toBeCloseTo(a.size * 2, 6);
  });
});

describe('roiFromDetectionBox', () => {
  test('hand ROI: rotation, shift along rotated axis, scale, square', () => {
    // Wrist below middle-finger MCP → upright hand → rotation 0.
    const det = {
      box: [0.4, 0.4, 0.6, 0.6],
      keypoints: [{ x: 0.5, y: 0.5 }, null, { x: 0.5, y: 0.4 }],
    };
    const roi = mp.roiFromDetectionBox(det, 100, 100, {
      rotStartKp: 0,
      rotEndKp: 2,
      targetAngle: Math.PI / 2,
      scale: 2.6,
      shiftY: -0.5,
    });
    expect(roi.rotation).toBeCloseTo(0, 6);
    // Box is 20×20 px; shift_y −0.5 moves the center up by half the height.
    expect(roi.cx).toBeCloseTo(50, 6);
    expect(roi.cy).toBeCloseTo(40, 6);
    // 20 px × 2.6, square_long.
    expect(roi.size).toBeCloseTo(52, 6);
  });

  test('face ROI: eye line already horizontal gives zero rotation, scale 1.5', () => {
    const det = {
      box: [0.3, 0.3, 0.7, 0.6],
      keypoints: [
        { x: 0.4, y: 0.4 },
        { x: 0.6, y: 0.4 },
      ],
    };
    const roi = mp.roiFromDetectionBox(det, 100, 100, { rotStartKp: 0, rotEndKp: 1, targetAngle: 0, scale: 1.5 });
    expect(roi.rotation).toBeCloseTo(0, 6);
    expect(roi.cx).toBeCloseTo(50, 6);
    expect(roi.cy).toBeCloseTo(45, 6);
    // Box 40×30 px → scaled 60×45 → square_long 60.
    expect(roi.size).toBeCloseTo(60, 6);
  });
});

describe('decodeDetections', () => {
  const inputSize = 224;
  const numCoords = 12;
  const numKeypoints = 4;

  function makeRaw(anchorBoxes) {
    // anchorBoxes: per anchor {dx, dy, w, h} in pixels (keypoints at box center)
    const boxes = new Float32Array(anchorBoxes.length * numCoords);
    for (let i = 0; i < anchorBoxes.length; i++) {
      const { dx = 0, dy = 0, w, h } = anchorBoxes[i];
      const o = i * numCoords;
      boxes[o] = dx;
      boxes[o + 1] = dy;
      boxes[o + 2] = w;
      boxes[o + 3] = h;
      for (let k = 0; k < numKeypoints; k++) {
        boxes[o + 4 + k * 2] = dx;
        boxes[o + 5 + k * 2] = dy;
      }
    }
    return boxes;
  }

  test('decodes boxes relative to anchors and merges overlaps (weighted NMS)', () => {
    const anchors = new Float32Array([0.25, 0.25, 0.26, 0.25, 0.75, 0.75]);
    const boxes = makeRaw([
      { w: 44.8, h: 44.8 }, // 0.2 normalized at anchor 0
      { w: 44.8, h: 44.8 }, // heavily overlapping anchor 1
      { w: 44.8, h: 44.8 }, // far-away anchor 2
    ]);
    // logits → sigmoid: 2.0 → 0.881, 1.0 → 0.731, 3.0 → 0.953
    const scores = new Float32Array([2.0, 1.0, 3.0]);

    const dets = mp.decodeDetections(boxes, scores, {
      anchors,
      inputSize,
      numCoords,
      numKeypoints,
      scoreThreshold: 0.5,
      maxResults: 4,
      contentScale: [1, 1],
    });

    expect(dets.length).toBe(2);
    // Highest score first (anchor 2).
    expect(dets[0].score).toBeCloseTo(1 / (1 + Math.exp(-3)), 6);
    expect((dets[0].box[0] + dets[0].box[2]) / 2).toBeCloseTo(0.75, 6);
    // Anchors 0 and 1 blend, weighted by score: cx = (0.25·s0 + 0.26·s1)/(s0+s1).
    const s0 = 1 / (1 + Math.exp(-2));
    const s1 = 1 / (1 + Math.exp(-1));
    const cx = (dets[1].box[0] + dets[1].box[2]) / 2;
    expect(cx).toBeCloseTo((0.25 * s0 + 0.26 * s1) / (s0 + s1), 6);
    expect(dets[1].keypoints[0].x).toBeCloseTo(cx, 6);
  });

  test('respects maxResults and score threshold', () => {
    const anchors = new Float32Array([0.2, 0.2, 0.5, 0.5, 0.8, 0.8]);
    const boxes = makeRaw([
      { w: 22.4, h: 22.4 },
      { w: 22.4, h: 22.4 },
      { w: 22.4, h: 22.4 },
    ]);
    const scores = new Float32Array([2.0, -2.0, 1.0]); // middle one below 0.5 threshold

    const dets = mp.decodeDetections(boxes, scores, {
      anchors,
      inputSize,
      numCoords,
      numKeypoints,
      scoreThreshold: 0.5,
      maxResults: 1,
      contentScale: [1, 1],
    });
    expect(dets.length).toBe(1);
    expect((dets[0].box[0] + dets[0].box[2]) / 2).toBeCloseTo(0.2, 6);
  });

  test('removes letterbox padding from boxes and keypoints', () => {
    // Landscape frame letterboxed vertically: content occupies half the height.
    const anchors = new Float32Array([0.5, 0.5]);
    const boxes = makeRaw([{ w: 44.8, h: 44.8 }]);
    const scores = new Float32Array([2.0]);
    const dets = mp.decodeDetections(boxes, scores, {
      anchors,
      inputSize,
      numCoords,
      numKeypoints,
      scoreThreshold: 0.5,
      maxResults: 1,
      contentScale: [1, 0.5],
    });
    // Center stays at 0.5, but height doubles when the padding is removed.
    expect((dets[0].box[1] + dets[0].box[3]) / 2).toBeCloseTo(0.5, 6);
    expect(dets[0].box[3] - dets[0].box[1]).toBeCloseTo(0.4, 6);
  });
});
