import { describe, expect, test } from 'vitest';
import { detectExportDefaults } from './render-defaults.js';

function movieNode({ frameCount, fps, speed }) {
  return {
    type: 'image.loadMovie',
    outPorts: [
      { name: 'frameCount', value: frameCount },
      { name: 'fps', value: fps },
    ],
    inPorts: [{ name: 'speed', value: speed }],
  };
}

describe('detectExportDefaults', () => {
  test('falls back to no frames and 60 fps without movie nodes', () => {
    const network = { nodes: [{ type: 'core.out', outPorts: [], inPorts: [] }] };
    expect(detectExportDefaults(network)).toEqual({ baseFrameCount: 0, adjustedFrameCount: 0, fps: 60, speed: 1, movieCount: 0 });
  });

  test('picks the movie with the most export frames after applying speed', () => {
    const network = {
      nodes: [movieNode({ frameCount: 100, fps: 30, speed: 1 }), movieNode({ frameCount: 300, fps: 25, speed: 2 })],
    };
    expect(detectExportDefaults(network)).toEqual({ baseFrameCount: 300, adjustedFrameCount: 150, fps: 25, speed: 2, movieCount: 2 });
  });

  test('treats a missing or non-positive speed as 1', () => {
    const network = { nodes: [movieNode({ frameCount: 10, fps: 24, speed: 0 })] };
    expect(detectExportDefaults(network).adjustedFrameCount).toBe(10);
  });
});
