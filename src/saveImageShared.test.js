import { describe, expect, test, vi } from 'vitest';

import { buildSaveImagePath, encodeWithCanvasFallback, ensureFallbackCanvas, parseSaveImageTemplate } from './saveImageShared.js';

describe('saveImageShared', () => {
  test('parses png and jpeg templates', () => {
    expect(parseSaveImageTemplate('image-#####.png')).toEqual({
      imageType: 'image/png',
      digits: 5,
      template: 'image-#####.png',
    });
    expect(parseSaveImageTemplate('image-##.jpg')).toEqual({
      imageType: 'image/jpeg',
      digits: 2,
      template: 'image-##.jpg',
    });
  });

  test('builds frame file paths with the existing numbering format', () => {
    expect(buildSaveImagePath('/tmp/out', 'image-#####.png', 42, 5)).toBe('/tmp/out/image-00042.png');
  });

  test('reuses fallback canvas for repeated sizes', () => {
    const state = {};
    const getContext = vi.fn(() => ({ putImageData: vi.fn() }));
    const canvas = { width: 0, height: 0, getContext };
    const createCanvas = vi.fn(() => canvas);

    const first = ensureFallbackCanvas(state, 640, 480, createCanvas);
    const second = ensureFallbackCanvas(state, 640, 480, createCanvas);

    expect(first.canvas).toBe(second.canvas);
    expect(createCanvas).toHaveBeenCalledTimes(1);
    expect(getContext).toHaveBeenCalledTimes(1);
  });

  test('encodes with fallback canvas and writes encoded bytes', async () => {
    const putImageData = vi.fn();
    const convertToBlob = vi.fn(async () => ({
      arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer,
    }));
    const createCanvas = vi.fn(() => ({
      width: 0,
      height: 0,
      getContext: () => ({ putImageData }),
      convertToBlob,
    }));
    const saveBufferToFile = vi.fn();
    const state = {};

    globalThis.ImageData = class ImageData {
      constructor(data, width, height) {
        this.data = data;
        this.width = width;
        this.height = height;
      }
    };

    await encodeWithCanvasFallback({
      state,
      rgba: new Uint8Array([255, 0, 0, 255]),
      width: 1,
      height: 1,
      filePath: '/tmp/frame.png',
      imageType: 'image/png',
      imageQuality: 1,
      saveBufferToFile,
      createCanvas,
    });

    expect(putImageData).toHaveBeenCalledTimes(1);
    expect(convertToBlob).toHaveBeenCalledWith({ type: 'image/png', quality: 1 });
    expect(saveBufferToFile).toHaveBeenCalledTimes(1);
  });
});
