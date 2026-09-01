import { describe, expect, it } from 'vitest';
import { findBundleProblems } from './check-bundle.js';

const clean = [
  '/build/assets/index.js',
  '/build/mediapipe/pose_landmarker_lite.task',
  '/build/onnxruntime-web/ort-wasm-simd-threaded.jsep.wasm',
  '/node_modules/react/index.js',
];

describe('findBundleProblems', () => {
  it('accepts a bundle with single model copies and no maps', () => {
    expect(findBundleProblems(clean)).toEqual([]);
  });

  it('rejects source maps', () => {
    const problems = findBundleProblems([...clean, '/node_modules/react/index.js.map']);
    expect(problems).toHaveLength(1);
    expect(problems[0]).toMatch(/source map/);
  });

  it('rejects a model file that ships twice', () => {
    const problems = findBundleProblems([...clean, '/examples/pose_landmarker_lite.task']);
    expect(problems).toHaveLength(1);
    expect(problems[0]).toMatch(/pose_landmarker_lite\.task ships 2 times/);
  });

  it('rejects wasm shipped from node_modules', () => {
    const problems = findBundleProblems([...clean, '/node_modules/@mediapipe/tasks-vision/wasm/vision_wasm_internal.wasm']);
    expect(problems).toHaveLength(1);
    expect(problems[0]).toMatch(/vision_wasm_internal\.wasm ships from node_modules/);
  });
});
