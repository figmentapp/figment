import { describe, expect, test } from 'vitest';
import { computeFitScale, displayOptionLabels, resolveDisplayIndex } from './displayUtils';

describe('computeFitScale', () => {
  test('contain letterboxes a wide image in a tall canvas', () => {
    const fit = computeFitScale('contain', 1000, 1000, 2000, 1000);
    expect(fit.width).toBe(1000);
    expect(fit.height).toBe(500);
    expect(fit.offsetX).toBe(0);
    expect(fit.offsetY).toBe(250);
    expect(fit.scale).toEqual([1, 0.5]);
  });

  test('cover fills the canvas and crops the excess', () => {
    const fit = computeFitScale('cover', 1000, 1000, 2000, 1000);
    expect(fit.width).toBe(2000);
    expect(fit.height).toBe(1000);
    expect(fit.offsetX).toBe(-500);
    expect(fit.scale).toEqual([2, 1]);
  });

  test('stretch ignores the aspect ratio', () => {
    const fit = computeFitScale('stretch', 1920, 1080, 512, 512);
    expect(fit.width).toBe(1920);
    expect(fit.height).toBe(1080);
    expect(fit.scale).toEqual([1, 1]);
  });

  test('1:1 maps texture pixels to canvas pixels', () => {
    const fit = computeFitScale('1:1', 1920, 1080, 640, 480);
    expect(fit.width).toBe(640);
    expect(fit.height).toBe(480);
    expect(fit.offsetX).toBe(640);
    expect(fit.offsetY).toBe(300);
    expect(fit.scale).toEqual([640 / 1920, 480 / 1080]);
  });

  test('unknown modes fall back to contain', () => {
    expect(computeFitScale('bogus', 100, 100, 200, 100)).toEqual(computeFitScale('contain', 100, 100, 200, 100));
  });
});

describe('displayOptionLabels', () => {
  test('uses the display label when available', () => {
    const labels = displayOptionLabels([
      { label: 'Built-in Display', bounds: { width: 1512, height: 982 } },
      { label: 'DELL U2720Q', bounds: { width: 2560, height: 1440 } },
    ]);
    expect(labels).toEqual(['Display 1: Built-in Display', 'Display 2: DELL U2720Q']);
  });

  test('falls back to the resolution when the label is empty', () => {
    const labels = displayOptionLabels([{ label: '', bounds: { width: 1920, height: 1080 } }]);
    expect(labels).toEqual(['Display 1: 1920×1080']);
  });
});

describe('resolveDisplayIndex', () => {
  test('parses the display number out of an option label', () => {
    expect(resolveDisplayIndex('Display 1: Built-in Display')).toBe(0);
    expect(resolveDisplayIndex('Display 3: DELL U2720Q')).toBe(2);
  });

  test('matches labels saved on another machine with different monitor names', () => {
    expect(resolveDisplayIndex('Display 2: Some Other Monitor')).toBe(1);
  });

  test('falls back to the primary display for unrecognized values', () => {
    expect(resolveDisplayIndex('')).toBe(0);
    expect(resolveDisplayIndex(undefined)).toBe(0);
    expect(resolveDisplayIndex('whatever')).toBe(0);
  });
});
