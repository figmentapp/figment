import { describe, expect, test, vi } from 'vitest';

import { clampJpegQuality, convertRgbaToBitmapBuffer, createNativeImageEncoder, detectNativeBitmapFormat } from './imageEncoding.js';

describe('imageEncoding', () => {
  test('detects native bitmap format from probe image', () => {
    const nativeImage = {
      createFromDataURL: vi.fn(() => ({
        isEmpty: () => false,
        toBitmap: () => Buffer.from([0, 0, 255, 255, 0, 128, 0, 128]),
      })),
    };

    expect(detectNativeBitmapFormat(nativeImage)).toEqual({
      order: ['b', 'g', 'r', 'a'],
      premultiplyAlpha: true,
    });
  });

  test('converts RGBA to native bitmap layout with reusable buffer', () => {
    const reusable = Buffer.alloc(8);
    const result = convertRgbaToBitmapBuffer(
      new Uint8Array([255, 0, 0, 255, 0, 255, 0, 128]),
      2,
      1,
      { order: ['b', 'g', 'r', 'a'], premultiplyAlpha: true },
      reusable,
    );

    expect(result).toBe(reusable);
    expect([...result]).toEqual([0, 0, 255, 255, 0, 128, 0, 128]);
  });

  test('maps jpeg quality from 0-1 to 0-100', () => {
    expect(clampJpegQuality(0)).toBe(0);
    expect(clampJpegQuality(0.426)).toBe(43);
    expect(clampJpegQuality(1.5)).toBe(100);
  });

  test('encodes with native image and writes jpeg directly to disk', async () => {
    const jpegBuffer = Buffer.from('jpeg');
    const writeFile = vi.fn();
    const nativeImage = {
      createFromDataURL: vi.fn(() => ({
        isEmpty: () => false,
        toBitmap: () => Buffer.from([0, 0, 255, 255, 0, 255, 0, 128]),
      })),
      createFromBitmap: vi.fn(() => ({
        isEmpty: () => false,
        toJPEG: vi.fn(() => jpegBuffer),
      })),
    };

    const encoder = createNativeImageEncoder({ nativeImage, writeFile });
    const didSave = await encoder.encodeAndSaveImage({
      rgbaBuffer: new Uint8Array([255, 0, 0, 255, 0, 255, 0, 128]),
      width: 2,
      height: 1,
      filePath: '/tmp/frame.jpg',
      imageType: 'image/jpeg',
      imageQuality: 0.9,
    });

    expect(didSave).toBe(true);
    expect(nativeImage.createFromBitmap).toHaveBeenCalledTimes(1);
    expect(writeFile).toHaveBeenCalledWith('/tmp/frame.jpg', jpegBuffer);
  });

  test('returns false when probe format cannot be determined', async () => {
    const writeFile = vi.fn();
    const nativeImage = {
      createFromDataURL: vi.fn(() => ({
        isEmpty: () => false,
        toBitmap: () => Buffer.from([1, 2, 3]),
      })),
    };

    const encoder = createNativeImageEncoder({ nativeImage, writeFile });
    const didSave = await encoder.encodeAndSaveImage({
      rgbaBuffer: new Uint8Array([255, 0, 0, 255]),
      width: 1,
      height: 1,
      filePath: '/tmp/frame.png',
      imageType: 'image/png',
      imageQuality: 1,
    });

    expect(didSave).toBe(false);
    expect(writeFile).not.toHaveBeenCalled();
  });
});
