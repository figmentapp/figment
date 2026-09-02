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

describe('decodeDetections: degenerate boxes', () => {
  test('a zero-area best box forms its own cluster instead of NaN and repeats', () => {
    const numCoords = 12;
    const numKeypoints = 4;
    const anchors = new Float32Array([0.5, 0.5, 0.2, 0.2]);
    const boxes = new Float32Array(2 * numCoords);
    // Anchor 0: zero width and height (IoU 0 with itself); anchor 1: a real box.
    boxes[numCoords + 2] = 22.4;
    boxes[numCoords + 3] = 22.4;
    const scores = new Float32Array([3.0, 2.0]);

    const dets = mp.decodeDetections(boxes, scores, {
      anchors,
      inputSize: 224,
      numCoords,
      numKeypoints,
      scoreThreshold: 0.5,
      maxResults: 4,
      contentScale: [1, 1],
    });

    expect(dets.length).toBe(2);
    for (const det of dets) for (const v of det.box) expect(Number.isNaN(v)).toBe(false);
    expect((dets[0].box[0] + dets[0].box[2]) / 2).toBeCloseTo(0.5, 6);
    expect((dets[1].box[0] + dets[1].box[2]) / 2).toBeCloseTo(0.2, 6);
  });
});

describe('PoseGpuPipeline.setModel', () => {
  const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

  function makePipeline() {
    const p = new mp.PoseGpuPipeline({ model: 'lite' });
    p.init = async () => {};
    p._landmarkSession = { name: 'lite', release: vi.fn() };
    const loads = new Map();
    p._createLandmarkSession = (model) => new Promise((resolve, reject) => loads.set(model, { resolve, reject }));
    return { p, loads };
  }

  test('keeps the installed model when the new session fails to load', async () => {
    const { p, loads } = makePipeline();
    const change = p.setModel('heavy');
    await flush();
    loads.get('heavy').reject(new Error('404'));
    await expect(change).rejects.toThrow('404');
    expect(p.model).toBe('lite');
    expect(p._landmarkSession.name).toBe('lite');

    // A second attempt is not a no-op.
    const retry = p.setModel('heavy');
    await flush();
    loads.get('heavy').resolve({ name: 'heavy', release: vi.fn() });
    await retry;
    expect(p.model).toBe('heavy');
    expect(p._landmarkSession.name).toBe('heavy');
  });

  test('applies rapid changes in call order', async () => {
    const { p, loads } = makePipeline();
    const first = p.setModel('full');
    const second = p.setModel('heavy');
    await flush();
    expect(loads.has('heavy')).toBe(false); // waits for 'full'
    const full = { name: 'full', release: vi.fn() };
    loads.get('full').resolve(full);
    await first;
    await flush();
    loads.get('heavy').resolve({ name: 'heavy', release: vi.fn() });
    await second;
    expect(p.model).toBe('heavy');
    expect(p._landmarkSession.name).toBe('heavy');
    expect(full.release).toHaveBeenCalled();
  });

  test('releases a session that finished loading after destroy()', async () => {
    const { p, loads } = makePipeline();
    const change = p.setModel('heavy');
    await flush();
    p.destroy();
    const heavy = { name: 'heavy', release: vi.fn() };
    loads.get('heavy').resolve(heavy);
    await change;
    expect(heavy.release).toHaveBeenCalled();
    expect(p.model).toBe('lite');
  });
});

describe('tracking mode', () => {
  test('still mode switches tracking off and back on', () => {
    const p = new mp.PoseGpuPipeline({ model: 'lite' });
    expect(p.tracking).toBe(true);
    p.tracking = false;
    expect(p.tracking).toBe(false);
    p.tracking = true;
    expect(p.tracking).toBe(true);
  });

  test('hands never track', () => {
    expect(new mp.HandGpuPipeline().tracking).toBe(false);
  });
});

describe('withOrt', () => {
  test('runs calls one at a time, in order, and survives rejections', async () => {
    const order = [];
    const gate = (name, ms, fail = false) =>
      mp.withOrt(async () => {
        order.push(`${name}:start`);
        await new Promise((r) => setTimeout(r, ms));
        order.push(`${name}:end`);
        if (fail) throw new Error(name);
      });
    const a = gate('a', 20, true);
    const b = gate('b', 1);
    await expect(a).rejects.toThrow('a');
    await b;
    expect(order).toEqual(['a:start', 'a:end', 'b:start', 'b:end']);
  });
});

describe('HandGpuPipeline handedness', () => {
  function decode(rawHandedness) {
    const p = new mp.HandGpuPipeline();
    p._frameWidth = 1920;
    p._frameHeight = 1080;
    const outputs = {
      score: { data: new Float32Array([0.99]) },
      landmarks: { data: new Float32Array(21 * 3) },
      world_landmarks: { data: new Float32Array(21 * 3) },
      handedness: { data: new Float32Array([rawHandedness]) },
    };
    return p._decodeInstance(outputs, { cx: 960, cy: 540, size: 300, rotation: 0 }).result.handedness[0];
  }

  // hand_landmarks_detector_graph.cc hardcodes label_items {0: Right, 1: Left}
  // and the binary classification gives index 0 the raw score.
  test('raw score is P(Right): label map {0: Right, 1: Left}', () => {
    expect(decode(0.9)).toMatchObject({ index: 0, categoryName: 'Right', score: expect.closeTo(0.9, 5) });
    expect(decode(0.1)).toMatchObject({ index: 1, categoryName: 'Left', score: expect.closeTo(0.9, 5) });
  });
});

describe('PoseGpuPipeline output validation', () => {
  const session = { outputNames: ['landmarks', 'score', 'world_landmarks'] };

  test('with the mask enabled, a landmark model without a mask output is rejected up front', () => {
    const p = new mp.PoseGpuPipeline({ model: 'lite', withMask: true });
    expect(() => p._requireOutputs(session, p._landmarkOutputNames)).toThrow(/"mask"/);
  });

  test('without the mask, the same model is accepted', () => {
    const p = new mp.PoseGpuPipeline({ model: 'lite', withMask: false });
    expect(() => p._requireOutputs(session, p._landmarkOutputNames)).not.toThrow();
  });
});

describe('SegmentGpuPipeline', () => {
  test('defaults to the category mask; nodes switch it live', () => {
    expect(new mp.SegmentGpuPipeline().binary).toBe(true);
    expect(new mp.SegmentGpuPipeline({ binary: false }).binary).toBe(false);
  });

  test('process() after destroy() resolves to null without initializing', async () => {
    const p = new mp.SegmentGpuPipeline();
    p.init = vi.fn();
    p.destroy();
    await expect(p.process({ width: 640, height: 480 })).resolves.toBeNull();
    expect(p.init).not.toHaveBeenCalled();
    expect(p.maskTarget).toBeNull();
  });
});

describe('smoothingMinCutoff', () => {
  test('0 disables; the cutoff falls on a log scale from 1 Hz to 0.01 Hz', () => {
    expect(mp.smoothingMinCutoff(0)).toBe(0);
    expect(mp.smoothingMinCutoff(1)).toBeCloseTo(0.01, 9);
    expect(mp.smoothingMinCutoff(0.5)).toBeCloseTo(0.1, 9);
    // MediaPipe's own min_cutoff (0.05 Hz) is the documented starting point, 0.65.
    expect(mp.smoothingMinCutoff(0.65)).toBeCloseTo(0.05, 2);
    expect(mp.smoothingMinCutoff(0.001)).toBeLessThan(1);
  });
});

describe('landmark smoothing', () => {
  const ROI = { cx: 320, cy: 240, size: 300, rotation: 0 };

  // One pose whose landmarks all sit at x = z = `x`, spread out in y.
  function pose(x) {
    const landmarks = [];
    const worldLandmarks = [];
    for (let i = 0; i < 33; i++) {
      landmarks.push({ x, y: 0.2 + i * 0.01, z: x, visibility: 0.7, presence: 0.8 });
      worldLandmarks.push({ x, y: i * 0.01, z: x });
    }
    return { score: 0.9, landmarks, worldLandmarks };
  }

  function pipeline(smoothing) {
    const p = new mp.PoseGpuPipeline();
    p._frameWidth = 640;
    p._frameHeight = 480;
    p.smoothing = smoothing;
    return p;
  }

  test('filters x, y, z of landmarks and world landmarks; visibility, presence and score pass through', () => {
    const p = pipeline(0.65);
    const first = [pose(0.2)];
    p._smoothResults(first, [ROI], 0);
    expect(first[0].landmarks[0].x).toBe(0.2); // first frame seeds the filters

    const second = [pose(0.3)];
    p._smoothResults(second, [ROI], 1 / 30);
    const lm = second[0].landmarks[5];
    expect(lm.x).toBeGreaterThan(0.2);
    expect(lm.x).toBeLessThan(0.3);
    expect(lm.z).toBeGreaterThan(0.2);
    expect(lm.z).toBeLessThan(0.3);
    expect(lm.y).toBeCloseTo(0.25, 12); // unchanged input stays put
    expect(lm.visibility).toBe(0.7);
    expect(lm.presence).toBe(0.8);
    expect(second[0].score).toBe(0.9);
    const world = second[0].worldLandmarks[5];
    expect(world.x).toBeGreaterThan(0.2);
    expect(world.x).toBeLessThan(0.3);
    expect(world.y).toBeCloseTo(0.05, 12);
  });

  test('smoothing 0 leaves the results untouched', () => {
    const p = pipeline(0);
    p._smoothResults([pose(0.2)], [ROI], 0);
    const second = [pose(0.3)];
    p._smoothResults(second, [ROI], 1 / 30);
    expect(second[0].landmarks[5].x).toBe(0.3);
    expect(second[0].worldLandmarks[5].x).toBe(0.3);
  });

  test('state follows the subject by ROI overlap, not by result order', () => {
    const p = pipeline(0.65);
    const left = { cx: 100, cy: 240, size: 150, rotation: 0 };
    const right = { cx: 500, cy: 240, size: 150, rotation: 0 };
    p._smoothResults([pose(0.1), pose(0.7)], [left, right], 0);

    // Same two subjects, reported in the other order and moved a little.
    const swapped = [pose(0.75), pose(0.15)];
    p._smoothResults(
      swapped,
      [
        { ...right, cx: 510 },
        { ...left, cx: 110 },
      ],
      1 / 30,
    );
    expect(swapped[0].landmarks[0].x).toBeGreaterThan(0.7);
    expect(swapped[0].landmarks[0].x).toBeLessThan(0.75);
    expect(swapped[1].landmarks[0].x).toBeGreaterThan(0.1);
    expect(swapped[1].landmarks[0].x).toBeLessThan(0.15);
  });

  test('a subject whose ROI overlaps nothing from the previous frame passes through unfiltered', () => {
    const p = pipeline(0.65);
    p._smoothResults([pose(0.2)], [ROI], 0);
    const elsewhere = [pose(0.9)];
    p._smoothResults(elsewhere, [{ cx: 40, cy: 40, size: 50, rotation: 0 }], 1 / 30);
    expect(elsewhere[0].landmarks[0].x).toBe(0.9);
  });

  test('resetTracking() and an empty frame drop the state', () => {
    const p = pipeline(0.65);
    p._smoothResults([pose(0.2)], [ROI], 0);
    p.resetTracking();
    const afterReset = [pose(0.3)];
    p._smoothResults(afterReset, [ROI], 1 / 30);
    expect(afterReset[0].landmarks[0].x).toBe(0.3);

    p._smoothResults([], [], 2 / 30);
    const afterGap = [pose(0.4)];
    p._smoothResults(afterGap, [ROI], 3 / 30);
    expect(afterGap[0].landmarks[0].x).toBe(0.4);
  });
});

describe('roiOverlap', () => {
  test('is the intersection over the smaller ROI, so a nested ROI counts as full overlap', () => {
    const small = { cx: 100, cy: 100, size: 100, rotation: 0 };
    const twiceAsBig = { cx: 100, cy: 100, size: 200, rotation: 0.3 };
    expect(mp.roiOverlap(small, twiceAsBig)).toBeCloseTo(1, 9);
    expect(mp.roiOverlap(twiceAsBig, small)).toBeCloseTo(1, 9);
    // Same size, shifted by half a side.
    expect(mp.roiOverlap(small, { ...small, cx: 150 })).toBeCloseTo(0.5, 9);
    expect(mp.roiOverlap(small, { ...small, cx: 300 })).toBe(0);
  });
});

describe('_mergeDetections', () => {
  test('rejects a detection of a tracked person even when its ROI is much larger', () => {
    const p = new mp.PoseGpuPipeline({ maxInstances: 4 });
    const tracked = { cx: 320, cy: 240, size: 300, rotation: 0 };
    const detections = [{ roi: { cx: 330, cy: 250, size: 700, rotation: 0.1 } }, { roi: { cx: 40, cy: 40, size: 60, rotation: 0 } }];
    p._roiFromDetection = (det) => det.roi;
    expect(p._mergeDetections([tracked], detections)).toEqual([tracked, detections[1].roi]);
  });
});
