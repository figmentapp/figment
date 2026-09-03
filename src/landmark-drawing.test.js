import { beforeAll, describe, expect, test, vi } from 'vitest';
import {
  POSE_CONNECTIONS,
  POSE_LANDMARK_COLORS,
  POSE_CONNECTION_COLORS,
  OPENPOSE_COLORS,
  HAND_CONNECTIONS,
  HAND_COLORS,
  HAND_LANDMARK_COLORS,
  HAND_CONNECTION_COLORS,
} from './landmark-connections';

// landmark-drawing.js imports figment.js, which touches GPU globals at
// module scope — stub them before importing (as mediapipe-gpu.test.js does).
let ld;
beforeAll(async () => {
  vi.stubGlobal('window', {});
  vi.stubGlobal('AudioContext', class AudioContext {});
  vi.stubGlobal('GPUBufferUsage', { COPY_DST: 8, MAP_READ: 1, STORAGE: 128, COPY_SRC: 4, UNIFORM: 64 });
  vi.stubGlobal('GPUMapMode', { READ: 1 });
  vi.stubGlobal('GPUTextureUsage', { TEXTURE_BINDING: 1, RENDER_ATTACHMENT: 2, COPY_SRC: 4, COPY_DST: 8, STORAGE_BINDING: 16 });
  ld = await import('./landmark-drawing');
});

const WHITE = [255, 255, 255, 1];

function instances(batch) {
  const out = [];
  const d = batch.data;
  for (let i = 0; i < batch.count; i++) {
    const o = i * 12;
    out.push({
      p0: [d[o], d[o + 1]],
      p1: [d[o + 2], d[o + 3]],
      radius: d[o + 4],
      round: d[o + 5] === 1,
      color: [...d.subarray(o + 8, o + 12)],
    });
  }
  return out;
}

describe('OverlayBatch', () => {
  test('a landmark is a round dot of radius + lineWidth / 2 at the scaled position', () => {
    const b = new ld.OverlayBatch();
    b.begin(200, 100);
    b.landmarks([{ x: 0.5, y: 0.25 }], { color: [255, 0, 0, 0.5], radius: 3 });
    expect(instances(b)).toEqual([{ p0: [100, 25], p1: [100, 25], radius: 5, round: true, color: [1, 0, 0, 0.5] }]);
  });

  test('a connector is a butt-capped segment of half the line width; pairs and {start, end} both work', () => {
    const b = new ld.OverlayBatch();
    b.begin(100, 100);
    const lms = [
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 1, y: 1 },
    ];
    b.connectors(lms, [[0, 1], { start: 1, end: 2 }], { color: WHITE, lineWidth: 3 });
    expect(instances(b)).toEqual([
      { p0: [0, 0], p1: [100, 0], radius: 1.5, round: false, color: [1, 1, 1, 1] },
      { p0: [100, 0], p1: [100, 100], radius: 1.5, round: false, color: [1, 1, 1, 1] },
    ]);
  });

  test('connectors take one color per connection, indexed like the connection list', () => {
    const b = new ld.OverlayBatch();
    b.begin(100, 100);
    const lms = [
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 1, y: 1 },
    ];
    const connections = [
      [0, 1],
      [1, 2],
    ];
    b.connectors(lms, connections, {
      color: [
        [255, 0, 0, 1],
        [0, 255, 0, 0.5],
      ],
    });
    expect(instances(b).map((i) => i.color)).toEqual([
      [1, 0, 0, 1],
      [0, 1, 0, 0.5],
    ]);
  });

  test('landmarks take one color per landmark; a short table throws', () => {
    const b = new ld.OverlayBatch();
    b.begin(10, 10);
    const lms = [
      { x: 0, y: 0 },
      { x: 1, y: 1 },
    ];
    b.landmarks(lms, {
      color: [
        [255, 0, 0, 1],
        [0, 0, 255, 1],
      ],
    });
    expect(instances(b).map((i) => i.color)).toEqual([
      [1, 0, 0, 1],
      [0, 0, 1, 1],
    ]);
    expect(() => b.landmarks(lms, { color: [[255, 0, 0, 1]] })).toThrow();
  });

  test('visibilityMin hides landmarks at or below it, and their connectors', () => {
    const b = new ld.OverlayBatch();
    b.begin(10, 10);
    const lms = [
      { x: 0, y: 0, visibility: 0 },
      { x: 1, y: 0, visibility: 1 },
      { x: 1, y: 1 }, // no visibility: always drawn
    ];
    b.landmarks(lms, { color: WHITE, visibilityMin: 0 });
    b.connectors(
      lms,
      [
        [0, 1],
        [1, 2],
      ],
      { color: WHITE, visibilityMin: 0 },
    );
    expect(instances(b).map((i) => [i.p0, i.p1])).toEqual([
      [
        [10, 0],
        [10, 0],
      ],
      [
        [10, 10],
        [10, 10],
      ],
      [
        [10, 0],
        [10, 10],
      ],
    ]);
  });

  test('without visibilityMin every landmark draws (DrawingUtils semantics)', () => {
    const b = new ld.OverlayBatch();
    b.begin(10, 10);
    b.landmarks([{ x: 0, y: 0, visibility: 0 }], { color: WHITE });
    expect(b.count).toBe(1);
  });

  test('zero-width lines and fully transparent colors draw nothing', () => {
    const b = new ld.OverlayBatch();
    b.begin(10, 10);
    b.connectors(
      [
        { x: 0, y: 0 },
        { x: 1, y: 1 },
      ],
      [[0, 1]],
      { color: WHITE, lineWidth: 0 },
    );
    b.landmarks([{ x: 0, y: 0 }], { color: [255, 255, 255, 0] });
    expect(b.count).toBe(0);
  });

  test('a rect is four sides extended by half the line width so corners meet', () => {
    const b = new ld.OverlayBatch();
    b.begin(100, 100);
    b.rect(0.1, 0.2, 0.5, 0.5, { color: WHITE, lineWidth: 2 });
    expect(instances(b).map((i) => [...i.p0, ...i.p1])).toEqual([
      [9, 20, 61, 20],
      [9, 70, 61, 70],
      [10, 19, 10, 71],
      [60, 19, 60, 71],
    ]);
  });

  test('grows past its initial capacity and resets on begin()', () => {
    const b = new ld.OverlayBatch();
    b.begin(1, 1);
    const lms = Array.from({ length: 500 }, (_, i) => ({ x: i, y: 0 }));
    b.landmarks(lms, { color: WHITE });
    expect(b.count).toBe(500);
    expect(instances(b)[499].p0).toEqual([499, 0]);
    b.begin(1, 1);
    expect(b.count).toBe(0);
  });
});

describe('canvas helpers', () => {
  function fakeContext() {
    const calls = [];
    const record =
      (name) =>
      (...args) =>
        calls.push([name, ...args]);
    return {
      calls,
      canvas: { width: 100, height: 50 },
      save: record('save'),
      restore: record('restore'),
      beginPath: record('beginPath'),
      arc: record('arc'),
      fill: record('fill'),
      stroke: record('stroke'),
      moveTo: record('moveTo'),
      lineTo: record('lineTo'),
    };
  }

  test('drawLandmarks scales to the canvas, applies the defaults and hides visibility <= 0.5', () => {
    const ctx = fakeContext();
    ld.drawLandmarks(ctx, [
      { x: 0.5, y: 0.5 },
      { x: 0, y: 0, visibility: 0.5 },
    ]);
    expect(ctx.fillStyle).toBe('white');
    expect(ctx.lineWidth).toBe(4);
    expect(ctx.calls.filter(([n]) => n === 'arc')).toEqual([['arc', 50, 25, 6, 0, 2 * Math.PI]]);
  });

  test('drawConnectors strokes each visible pair once', () => {
    const ctx = fakeContext();
    const lms = [
      { x: 0, y: 0 },
      { x: 1, y: 1 },
      { x: 0.5, y: 0.5, visibility: 0 },
    ];
    ld.drawConnectors(ctx, lms, [[0, 1], { start: 1, end: 2 }], { color: 'red', lineWidth: 1, visibilityMin: 0 });
    expect(ctx.strokeStyle).toBe('red');
    expect(ctx.calls.filter(([n]) => n === 'moveTo' || n === 'lineTo')).toEqual([
      ['moveTo', 0, 0],
      ['lineTo', 100, 50],
    ]);
    expect(ctx.calls.filter(([n]) => n === 'stroke')).toHaveLength(1);
  });
});

describe('OpenPose color tables', () => {
  test('one color per OpenPose keypoint, pose landmark and pose connection', () => {
    expect(OPENPOSE_COLORS).toHaveLength(18);
    expect(POSE_LANDMARK_COLORS).toHaveLength(33);
    expect(POSE_CONNECTION_COLORS).toHaveLength(POSE_CONNECTIONS.length);
  });

  test('mirrored landmarks never share a color', () => {
    // Every left/right pair of the BlazePose list; 9/10 (mouth) both map to
    // the nose and are left out.
    const mirrored = [
      [1, 4],
      [2, 5],
      [3, 6],
      [7, 8],
      [11, 12],
      [13, 14],
      [15, 16],
      [17, 18],
      [19, 20],
      [21, 22],
      [23, 24],
      [25, 26],
      [27, 28],
      [29, 30],
      [31, 32],
    ];
    for (const [left, right] of mirrored) {
      expect(POSE_LANDMARK_COLORS[left], `landmarks ${left} and ${right}`).not.toEqual(POSE_LANDMARK_COLORS[right]);
    }
  });

  test('a connection takes the color of its second landmark', () => {
    POSE_CONNECTIONS.forEach(([, end], i) => {
      expect(POSE_CONNECTION_COLORS[i]).toBe(POSE_LANDMARK_COLORS[end]);
    });
  });
});

describe('hand color tables', () => {
  test('one color per hand, per landmark and per connection, for each handedness', () => {
    for (const side of ['Right', 'Left']) {
      expect(HAND_COLORS[side]).toHaveLength(4);
      expect(HAND_LANDMARK_COLORS[side]).toHaveLength(21);
      expect(HAND_CONNECTION_COLORS[side]).toHaveLength(HAND_CONNECTIONS.length);
    }
  });

  test('no landmark color is shared between the two hands', () => {
    const left = new Set(HAND_LANDMARK_COLORS.Left.map(String));
    for (const color of HAND_LANDMARK_COLORS.Right) expect(left.has(String(color))).toBe(false);
  });

  test('within a hand, the wrist and the five fingertips all differ', () => {
    for (const side of ['Right', 'Left']) {
      const colors = [0, 4, 8, 12, 16, 20].map((i) => String(HAND_LANDMARK_COLORS[side][i]));
      expect(new Set(colors).size).toBe(6);
    }
  });

  test('a connection takes the color of its second landmark; the hand color is the wrist color', () => {
    for (const side of ['Right', 'Left']) {
      HAND_CONNECTIONS.forEach(([, end], i) => {
        expect(HAND_CONNECTION_COLORS[side][i]).toBe(HAND_LANDMARK_COLORS[side][end]);
      });
      expect(HAND_COLORS[side]).toBe(HAND_LANDMARK_COLORS[side][0]);
    }
  });
});

describe('drawSkeleton', () => {
  const lms = Array.from({ length: 33 }, (_, i) => ({ x: i / 33, y: 0.5 }));
  const style = {
    coloring: 'per limb',
    drawPoints: true,
    pointsColor: [255, 0, 0, 1],
    pointsRadius: 2,
    drawLines: true,
    linesColor: [0, 255, 0, 1],
    linesWidth: 3,
  };

  test('per limb coloring on a pose draws the OpenPose palette, like Detect Pose', () => {
    const a = new ld.OverlayBatch();
    a.begin(100, 100);
    ld.drawSkeleton(a, lms, ld.SKELETONS.pose, style);

    const b = new ld.OverlayBatch();
    b.begin(100, 100);
    b.landmarks(lms, { color: POSE_LANDMARK_COLORS, radius: 2 });
    b.connectors(lms, POSE_CONNECTIONS, { color: POSE_CONNECTION_COLORS, lineWidth: 3 });
    expect(instances(a)).toEqual(instances(b));
    expect(a.count).toBe(33 + POSE_CONNECTIONS.length);
  });

  test('per limb coloring on a face falls back to the solid colors', () => {
    const a = new ld.OverlayBatch();
    a.begin(100, 100);
    const face = Array.from({ length: 478 }, (_, i) => ({ x: i / 478, y: 0.5 }));
    ld.drawSkeleton(a, face, ld.SKELETONS.face, style);
    const colors = new Set(instances(a).map((i) => i.color.join()));
    expect(colors).toEqual(new Set(['1,0,0,1', '0,1,0,1']));
  });

  test('draw points and draw lines switch each part off', () => {
    const a = new ld.OverlayBatch();
    a.begin(100, 100);
    ld.drawSkeleton(a, lms, ld.SKELETONS.pose, { ...style, drawLines: false });
    expect(a.count).toBe(33);
    a.begin(100, 100);
    ld.drawSkeleton(a, lms, ld.SKELETONS.pose, { ...style, drawPoints: false });
    expect(a.count).toBe(POSE_CONNECTIONS.length);
  });
});
