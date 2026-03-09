import { describe, expect, test } from 'vitest';

// Pure reimplementation of the export mapping formula from loadImageFolder.js.
// _fileIndex = Math.floor(exportTime * frameRate) % fileCount
// where exportTime = (currentFrame - 1) / exportFps
function calculateFileIndex(currentFrame, exportFps, frameRate, fileCount) {
  const exportTime = (currentFrame - 1) / exportFps;
  return Math.floor(exportTime * frameRate) % fileCount;
}

describe('loadImageFolder export mapping', () => {
  test('matching FPS (export 10fps, folder 10fps, 5 files): 1:1 with wrap', () => {
    expect(calculateFileIndex(1, 10, 10, 5)).toBe(0);
    expect(calculateFileIndex(2, 10, 10, 5)).toBe(1);
    expect(calculateFileIndex(3, 10, 10, 5)).toBe(2);
    expect(calculateFileIndex(4, 10, 10, 5)).toBe(3);
    expect(calculateFileIndex(5, 10, 10, 5)).toBe(4);
    // Wraps around
    expect(calculateFileIndex(6, 10, 10, 5)).toBe(0);
    expect(calculateFileIndex(7, 10, 10, 5)).toBe(1);
  });

  test('export faster than folder (30fps export, 10fps folder): each image held 3 frames', () => {
    expect(calculateFileIndex(1, 30, 10, 5)).toBe(0);
    expect(calculateFileIndex(2, 30, 10, 5)).toBe(0);
    expect(calculateFileIndex(3, 30, 10, 5)).toBe(0);
    expect(calculateFileIndex(4, 30, 10, 5)).toBe(1);
    expect(calculateFileIndex(5, 30, 10, 5)).toBe(1);
    expect(calculateFileIndex(6, 30, 10, 5)).toBe(1);
    expect(calculateFileIndex(7, 30, 10, 5)).toBe(2);
  });

  test('export slower than folder (5fps export, 10fps folder): images skipped', () => {
    // Each export frame advances 2 folder frames
    expect(calculateFileIndex(1, 5, 10, 5)).toBe(0);
    expect(calculateFileIndex(2, 5, 10, 5)).toBe(2);
    expect(calculateFileIndex(3, 5, 10, 5)).toBe(4);
    expect(calculateFileIndex(4, 5, 10, 5)).toBe(1); // wraps: 6 % 5 = 1
  });

  test('wrapping when index exceeds file count', () => {
    // 10 files, 10fps folder, 10fps export — wraps after 10 frames
    for (let frame = 1; frame <= 20; frame++) {
      const idx = calculateFileIndex(frame, 10, 10, 10);
      expect(idx).toBe((frame - 1) % 10);
    }
  });

  test('single file: always index 0', () => {
    expect(calculateFileIndex(1, 30, 10, 1)).toBe(0);
    expect(calculateFileIndex(50, 30, 10, 1)).toBe(0);
    expect(calculateFileIndex(100, 60, 24, 1)).toBe(0);
  });
});
