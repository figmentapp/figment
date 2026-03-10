import { describe, expect, test } from 'vitest';

// Pure reimplementation of calculateTargetFrame's export branch for testing.
// Original lives in loadMovie.js line 244–250.
function calculateTargetFrame(exportFrameIndex, exportFps, detectedFps, speed, frameCount) {
  const safeFps = detectedFps > 0 ? detectedFps : 1;
  const effectiveSpeed = Number.isFinite(speed) ? Math.max(speed, 0) : 1;
  const videoFrame = Math.floor((exportFrameIndex / exportFps) * safeFps * effectiveSpeed);
  return Math.min(videoFrame, frameCount - 1);
}

describe('loadMovie calculateTargetFrame export formula', () => {
  test('matching FPS (30/30): frames 1–30 map to video 0–29', () => {
    for (let frame = 1; frame <= 30; frame++) {
      expect(calculateTargetFrame(frame - 1, 30, 30, 1, 30)).toBe(frame - 1);
    }
  });

  test('export FPS > source (60/30): duplicate frames', () => {
    // Two export frames per video frame
    expect(calculateTargetFrame(0, 60, 30, 1, 100)).toBe(0);
    expect(calculateTargetFrame(1, 60, 30, 1, 100)).toBe(0);
    expect(calculateTargetFrame(2, 60, 30, 1, 100)).toBe(1);
    expect(calculateTargetFrame(3, 60, 30, 1, 100)).toBe(1);
    expect(calculateTargetFrame(4, 60, 30, 1, 100)).toBe(2);
  });

  test('export FPS < source (15/30): skip frames', () => {
    // Each export frame advances 2 video frames
    expect(calculateTargetFrame(0, 15, 30, 1, 100)).toBe(0);
    expect(calculateTargetFrame(1, 15, 30, 1, 100)).toBe(2);
    expect(calculateTargetFrame(2, 15, 30, 1, 100)).toBe(4);
  });

  test('speed=2 doubles the rate', () => {
    expect(calculateTargetFrame(0, 30, 30, 2, 100)).toBe(0);
    expect(calculateTargetFrame(1, 30, 30, 2, 100)).toBe(2);
    expect(calculateTargetFrame(2, 30, 30, 2, 100)).toBe(4);
  });

  test('frame 1 always maps to video frame 0', () => {
    expect(calculateTargetFrame(0, 24, 24, 1, 100)).toBe(0);
    expect(calculateTargetFrame(0, 60, 30, 1, 100)).toBe(0);
    expect(calculateTargetFrame(0, 15, 30, 2, 100)).toBe(0);
  });

  test('clamps to frameCount - 1', () => {
    // With 10 frames, even a large index should clamp
    expect(calculateTargetFrame(100, 30, 30, 1, 10)).toBe(9);
  });

  test('sequential export frames produce monotonically increasing video frames', () => {
    const results = [];
    for (let frame = 1; frame <= 60; frame++) {
      results.push(calculateTargetFrame(frame - 1, 30, 30, 1, 100));
    }
    // Each frame should be >= previous (monotonically non-decreasing)
    for (let i = 1; i < results.length; i++) {
      expect(results[i]).toBeGreaterThanOrEqual(results[i - 1]);
    }
    // And specifically for matching FPS, each frame should be exactly previous + 1
    for (let i = 1; i < results.length; i++) {
      expect(results[i]).toBe(results[i - 1] + 1);
    }
  });
});
