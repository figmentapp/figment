import { beforeAll, describe, expect, test, vi } from 'vitest';

let computeReadbackLayout;
let copyReadbackBufferToRgba;
let destroyReadbackCache;
let ensureReadbackCache;
let acquireReadbackSlot;
let releaseReadbackSlot;

beforeAll(async () => {
  globalThis.window = {};
  globalThis.AudioContext = class AudioContext {};
  globalThis.GPUTextureUsage = {
    TEXTURE_BINDING: 1,
    RENDER_ATTACHMENT: 2,
    COPY_SRC: 4,
    COPY_DST: 8,
  };

  const figment = await import('./figment.js');
  computeReadbackLayout = figment.computeReadbackLayout;
  copyReadbackBufferToRgba = figment.copyReadbackBufferToRgba;
  destroyReadbackCache = figment.destroyReadbackCache;
  ensureReadbackCache = figment.ensureReadbackCache;
  acquireReadbackSlot = figment.acquireReadbackSlot;
  releaseReadbackSlot = figment.releaseReadbackSlot;
});

describe('figment readback helpers', () => {
  test('computes aligned readback layout', () => {
    expect(computeReadbackLayout(3, 2)).toEqual({
      bytesPerRow: 256,
      bufferSize: 512,
    });
  });

  test('copies padded rows into a tight rgba buffer', () => {
    const target = new Uint8Array(16);
    const mapped = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 0, 0, 0, 0, 9, 10, 11, 12, 13, 14, 15, 16, 0, 0, 0, 0]);

    copyReadbackBufferToRgba(mapped, 2, 2, 12, target);

    expect([...target]).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16]);
  });

  test('reuses readback buffers for unchanged dimensions and reallocates on resize', () => {
    const createdBuffers = [];
    const target = { width: 64, height: 32, _readbackCache: null };
    const createBuffer = vi.fn((size) => {
      const buffer = { size, destroy: vi.fn() };
      createdBuffers.push(buffer);
      return buffer;
    });

    const first = ensureReadbackCache(target, createBuffer);
    const second = ensureReadbackCache(target, createBuffer);
    target.width = 32;
    const third = ensureReadbackCache(target, createBuffer);

    expect(first).toBe(second);
    expect(third).not.toBe(first);
    expect(first.stagingBuffer).toBeNull();
    expect(createdBuffers).toHaveLength(2);
    expect(createdBuffers[0].destroy).toHaveBeenCalledTimes(1);
  });

  test('destroys staging buffers when the cache is torn down', () => {
    const destroy = vi.fn();
    const cache = {
      stagingBuffer: { destroy },
      rgbaBuffer: new Uint8Array(4),
    };

    destroyReadbackCache(cache);

    expect(destroy).toHaveBeenCalledTimes(1);
    expect(cache.stagingBuffer).toBeNull();
    expect(cache.rgbaBuffer).toBeNull();
  });

  test('falls back to a temporary readback slot when the cached slot is busy', () => {
    const createdBuffers = [];
    const target = { width: 16, height: 16, _readbackCache: null };
    const createBuffer = vi.fn((size) => {
      const buffer = { size, destroy: vi.fn() };
      createdBuffers.push(buffer);
      return buffer;
    });

    const first = acquireReadbackSlot(target, createBuffer);
    const second = acquireReadbackSlot(target, createBuffer);

    expect(first.temporary).toBe(false);
    expect(second.temporary).toBe(true);
    expect(first.stagingBuffer).not.toBe(second.stagingBuffer);

    releaseReadbackSlot(first);
    releaseReadbackSlot(second);

    expect(createdBuffers).toHaveLength(2);
    expect(createdBuffers[1].destroy).toHaveBeenCalledTimes(1);
    expect(target._readbackCache.busy).toBe(false);
  });
});
