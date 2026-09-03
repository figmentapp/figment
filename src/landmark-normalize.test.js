import { describe, expect, test } from 'vitest';
import { measurePose, measureFace, normalizeLandmarks, MeasurementEstimator, createNormalizeNode, POSE_RECIPE } from './landmark-normalize';

// A BlazePose skeleton with only the landmarks the recipes read; the rest
// sit at the origin.
function pose({ nose, hips, ankles, wrists = [] }) {
  const lms = Array.from({ length: 33 }, () => ({ x: 0, y: 0, z: 0, visibility: 1 }));
  lms[0] = { ...lms[0], ...nose };
  [lms[23], lms[24]] = hips.map((p) => ({ ...lms[23], ...p }));
  [lms[27], lms[28]] = ankles.map((p) => ({ ...lms[27], ...p }));
  wrists.forEach((p, i) => (lms[15 + i] = { ...lms[15 + i], ...p }));
  return lms;
}

const STANDING = pose({
  nose: { x: 0.52, y: 0.2 },
  hips: [
    { x: 0.45, y: 0.55 },
    { x: 0.55, y: 0.55 },
  ],
  ankles: [
    { x: 0.4, y: 0.88 },
    { x: 0.6, y: 0.92 },
  ],
});

describe('measurePose', () => {
  test('anchor is the hip x and ankle y midpoint, size is the vertical ankle-to-nose distance', () => {
    expect(measurePose(STANDING)).toEqual({ anchor: { x: 0.5, y: 0.9 }, size: 0.7 });
  });

  test('arm positions do not change the measurement', () => {
    const arms = pose({
      nose: { x: 0.52, y: 0.2 },
      hips: [
        { x: 0.45, y: 0.55 },
        { x: 0.55, y: 0.55 },
      ],
      ankles: [
        { x: 0.4, y: 0.88 },
        { x: 0.6, y: 0.92 },
      ],
      wrists: [
        { x: 0.1, y: 0.05 },
        { x: 0.9, y: 0.05 },
      ],
    });
    expect(measurePose(arms)).toEqual(measurePose(STANDING));
  });

  test('a missing landmark gives null', () => {
    expect(measurePose(STANDING.slice(0, 20))).toBeNull();
    expect(measurePose(null)).toBeNull();
  });
});

describe('measureFace', () => {
  test('anchor is the midpoint of the outer eye corners, size is their distance', () => {
    const lms = Array.from({ length: 478 }, () => ({ x: 0, y: 0, z: 0 }));
    lms[33] = { x: 0.4, y: 0.5, z: 0 };
    lms[263] = { x: 0.7, y: 0.9, z: 0 };
    const m = measureFace(lms);
    expect(m.anchor.x).toBeCloseTo(0.55);
    expect(m.anchor.y).toBeCloseTo(0.7);
    expect(m.size).toBeCloseTo(0.5);
    expect(measureFace(lms.slice(0, 100))).toBeNull();
  });
});

describe('normalizeLandmarks', () => {
  const reference = { anchor: { x: 0.5, y: 0.9 }, size: 0.7 };

  test('identity when the estimate equals the reference', () => {
    const frame = measurePose(STANDING);
    const out = normalizeLandmarks(STANDING, frame, frame, reference);
    out.forEach((lm, i) => {
      expect(lm.x).toBeCloseTo(STANDING[i].x);
      expect(lm.y).toBeCloseTo(STANDING[i].y);
      expect(lm.z).toBeCloseTo(STANDING[i].z);
    });
    expect(out).not.toBe(STANDING);
  });

  test('a taller estimate shrinks about the anchor: ankle line on the floor, nose at reference height, z scaled, visibility kept', () => {
    // Someone twice as tall as the reference, standing closer to the camera.
    const tall = STANDING.map((lm) => ({ ...lm, x: 0.3 + (lm.x - 0.5) * 2, y: 0.95 + (lm.y - 0.9) * 2, z: lm.z * 2, visibility: 0.7 }));
    tall[0].z = 0.4;
    const frame = measurePose(tall);
    expect(frame.size).toBeCloseTo(1.4);
    const out = normalizeLandmarks(tall, frame, frame, reference);
    expect(out[27].y + (out[28].y - out[27].y) / 2).toBeCloseTo(0.9); // ankle line on the reference floor
    expect(out[0].y).toBeCloseTo(0.2); // nose at floor - reference height
    expect(out[0].z).toBeCloseTo(0.2); // z scaled by the same 0.5
    expect(out[0].visibility).toBe(0.7);
    const m = measurePose(out);
    expect(m.size).toBeCloseTo(reference.size);
    expect(m.anchor.x).toBeCloseTo(0.3); // keep: no horizontal move
  });

  test('keep leaves x where it is; follow maps the estimated hip x to the reference x, a per-frame offset still shows', () => {
    const estimate = { anchor: { x: 0.3, y: 0.9 }, size: 0.7 };
    const frame = { anchor: { x: 0.35, y: 0.9 }, size: 0.7 };
    const lms = [{ x: 0.35, y: 0.5 }];
    expect(normalizeLandmarks(lms, frame, estimate, reference, { horizontal: 'keep' })[0].x).toBeCloseTo(0.35);
    expect(normalizeLandmarks(lms, frame, estimate, reference, { horizontal: 'follow' })[0].x).toBeCloseTo(0.55);
  });

  test('treadmill puts this frame’s hip x on the reference x exactly, every frame', () => {
    const estimate = { anchor: { x: 0.3, y: 0.9 }, size: 0.7 };
    for (const hipX of [0.1, 0.35, 0.8]) {
      const frame = { anchor: { x: hipX, y: 0.9 }, size: 0.7 };
      const lms = [
        { x: hipX, y: 0.5 },
        { x: hipX + 0.1, y: 0.5 },
      ];
      const out = normalizeLandmarks(lms, frame, estimate, reference, { horizontal: 'treadmill' });
      expect(out[0].x).toBeCloseTo(0.5);
      expect(out[1].x).toBeCloseTo(0.6);
    }
  });

  test('returns the input unchanged without a frame, an estimate, or with a zero size', () => {
    const lms = [{ x: 0.1, y: 0.2 }];
    const m = { anchor: { x: 0, y: 0 }, size: 1 };
    expect(normalizeLandmarks(lms, null, m, reference)).toBe(lms);
    expect(normalizeLandmarks(lms, m, null, reference)).toBe(lms);
    expect(normalizeLandmarks(lms, m, { ...m, size: 0 }, reference)).toBe(lms);
  });
});

const FPS = 30;
function feed(est, measurement, from, seconds) {
  for (let i = 0; i < seconds * FPS; i++) est.push(measurement, from + i / FPS);
  return from + seconds;
}
const m = (x, y, size) => ({ anchor: { x, y }, size });

describe('MeasurementEstimator continuous', () => {
  test('one outlier frame does not move the estimate; a sustained change does after the window', () => {
    const est = new MeasurementEstimator({ mode: 'continuous', windowSeconds: 3, anchorYPercentile: 0.9 });
    let t = feed(est, m(0.5, 0.9, 0.7), 0, 3);
    expect(est.current()).toEqual(m(0.5, 0.9, 0.7));
    est.push(m(0.1, 0.3, 2), t);
    expect(est.current()).toEqual(m(0.5, 0.9, 0.7));
    t = feed(est, m(0.6, 0.8, 0.5), t, 1);
    expect(est.current()).toEqual(m(0.5, 0.9, 0.7)); // the old samples still outnumber the new
    t = feed(est, m(0.6, 0.8, 0.5), t, 3);
    expect(est.current()).toEqual(m(0.6, 0.8, 0.5));
  });

  test('the floor estimate is the lowest standing position, not the mid-jump one', () => {
    const est = new MeasurementEstimator({ mode: 'continuous', windowSeconds: 3, anchorYPercentile: 0.9 });
    let t = feed(est, m(0.5, 0.9, 0.7), 0, 2);
    t = feed(est, m(0.5, 0.6, 0.7), t, 0.5); // half a second in the air
    feed(est, m(0.5, 0.9, 0.7), t, 0.5);
    expect(est.current().anchor.y).toBe(0.9);
  });

  test('gives a running estimate before the window is full, and null with no samples', () => {
    const est = new MeasurementEstimator({ mode: 'continuous', windowSeconds: 3 });
    expect(est.current()).toBeNull();
    est.push(m(0.5, 0.9, 0.7), 0);
    expect(est.current()).toEqual(m(0.5, 0.9, 0.7));
  });
});

describe('MeasurementEstimator on reset', () => {
  test('frozen after the window; reset() re-opens it', () => {
    const est = new MeasurementEstimator({ mode: 'on reset', windowSeconds: 2 });
    let t = feed(est, m(0.5, 0.9, 0.7), 0, 1);
    expect(est.current()).toEqual(m(0.5, 0.9, 0.7)); // running estimate while the window fills
    t = feed(est, m(0.5, 0.9, 0.7), t, 1);
    t = feed(est, m(0.2, 0.5, 0.3), t, 10);
    expect(est.current()).toEqual(m(0.5, 0.9, 0.7));
    est.reset();
    expect(est.current()).toBeNull();
    feed(est, m(0.2, 0.5, 0.3), t, 3);
    expect(est.current()).toEqual(m(0.2, 0.5, 0.3));
  });
});

describe('MeasurementEstimator manual', () => {
  test('returns the manual values and ignores push', () => {
    const est = new MeasurementEstimator({ mode: 'manual' });
    expect(est.current()).toBeNull();
    est.setManual(m(0.4, 0.8, 0.6));
    feed(est, m(0.5, 0.9, 0.7), 0, 5);
    expect(est.current()).toEqual(m(0.4, 0.8, 0.6));
  });
});

// Enough of Node for createNormalizeNode: in and out ports by name.
function fakeNode() {
  const ports = {};
  const outs = {};
  const port = (table, name, value) => (table[name] = { name, value });
  return {
    ports,
    outs,
    objectIn: (name) => port(ports, name, null),
    numberIn: (name, value) => port(ports, name, value),
    selectIn: (name, options, value) => port(ports, name, value),
    objectOut: (name) => port(outs, name, null),
    imageOut: (name) => port(outs, name, null),
    numberOut: (name) => port(outs, name, 0),
    triggerButtonIn: (name) => port(ports, name, null),
  };
}

describe('createNormalizeNode', () => {
  test('transforms the first person, reports its measurement, and passes other types through with an error', () => {
    const node = fakeNode();
    let t = 0;
    createNormalizeNode(node, POSE_RECIPE, { now: () => t });
    const p = node.ports;
    expect(p['reference floor'].value).toBe(0.9);
    expect(p['reference height'].value).toBe(0.6);
    expect(p['horizontal'].value).toBe('keep');

    // Someone half the reference height, feet at 0.7.
    const small = STANDING.map((lm) => ({ ...lm, y: 0.7 + (lm.y - 0.9) * 0.5 }));
    p['landmarks'].value = { type: 'pose', landmarks: [small] };
    for (let i = 0; i < 30; i++) {
      t = i / 30;
      node.onRender();
    }
    expect(node.outs['measured floor'].value).toBeCloseTo(0.7);
    expect(node.outs['measured height'].value).toBeCloseTo(0.35);
    expect(node.outs['measured x'].value).toBeCloseTo(0.5);
    const out = node.outs['landmarks'];
    const m = measurePose(out.value.landmarks[0]);
    expect(m.anchor.y).toBeCloseTo(0.9);
    expect(m.size).toBeCloseTo(0.6);
    expect(out.value.type).toBe('pose');

    p['landmarks'].value = { type: 'face', landmarks: [[]] };
    expect(() => node.onRender()).toThrow(/pose/);
    expect(out.value).toEqual({ type: 'face', landmarks: [[]] });

    p['landmarks'].value = null;
    node.onRender();
    expect(out.value).toBeNull();
  });

  test('manual mode uses the driver values; a person slot that disappears for a window is reset', () => {
    const node = fakeNode();
    let t = 0;
    createNormalizeNode(node, POSE_RECIPE, { now: () => t });
    const p = node.ports;
    p['measure'].value = 'manual';
    p['driver floor'].value = 0.8;
    p['driver height'].value = 0.4;
    p['driver x'].value = 0.5;
    p['landmarks'].value = { type: 'pose', landmarks: [STANDING] };
    node.onRender();
    // STANDING is 0.7 tall on floor 0.9; the driver says 0.4 on 0.8, so it is
    // scaled by 0.6 / 0.4 about (0.5, 0.8), then put on floor 0.9.
    const m = measurePose(node.outs['landmarks'].value.landmarks[0]);
    expect(m.size).toBeCloseTo(0.7 * 1.5);
    expect(m.anchor.y).toBeCloseTo(0.9 + 0.1 * 1.5);
    expect(node.outs['measured floor'].value).toBe(0.8);

    p['measure'].value = 'continuous';
    p['measure'].onChange();
    node.onRender();
    expect(node.outs['measured floor'].value).toBeCloseTo(0.9);
    p['landmarks'].value = { type: 'pose', landmarks: [] };
    t = 10;
    node.onRender();
    expect(node.outs['measured floor'].value).toBe(0);
  });

  test('the measure again button re-opens an "on reset" measurement', () => {
    const node = fakeNode();
    let t = 0;
    createNormalizeNode(node, POSE_RECIPE, { now: () => t });
    const p = node.ports;
    p['measure'].value = 'on reset';
    p['window'].value = 1;
    p['measure'].onChange();
    p['landmarks'].value = { type: 'pose', landmarks: [STANDING] };
    for (; t < 2; t += 1 / 30) node.onRender();
    const small = STANDING.map((lm) => ({ ...lm, y: 0.7 + (lm.y - 0.9) * 0.5 }));
    p['landmarks'].value = { type: 'pose', landmarks: [small] };
    for (; t < 4; t += 1 / 30) node.onRender();
    expect(node.outs['measured floor'].value).toBeCloseTo(0.9); // frozen on the first person
    p['measure again'].onTrigger();
    for (; t < 6; t += 1 / 30) node.onRender();
    expect(node.outs['measured floor'].value).toBeCloseTo(0.7);
  });
});

describe('createNormalizeNode image', () => {
  test('draws the normalized landmarks with the injected drawing, image first', () => {
    const node = fakeNode();
    const drawn = [];
    const draw = (n) => {
      n.imageOut('out');
      return { render: (input) => drawn.push(input) };
    };
    createNormalizeNode(node, POSE_RECIPE, { now: () => 0, draw });
    expect(Object.keys(node.outs)[0]).toBe('out');
    node.ports['landmarks'].value = { type: 'pose', landmarks: [STANDING] };
    node.onRender();
    expect(drawn).toEqual([node.outs['landmarks'].value]);
    node.ports['landmarks'].value = null;
    node.onRender();
    expect(drawn[1]).toBeNull();
  });
});
