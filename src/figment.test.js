import { afterEach, describe, expect, test, vi } from 'vitest';

async function loadFigmentWithGpuStubs() {
  vi.resetModules();
  vi.stubGlobal('window', {});
  vi.stubGlobal('AudioContext', class AudioContext {});
  vi.stubGlobal('GPUBufferUsage', { COPY_DST: 8, MAP_READ: 1 });
  vi.stubGlobal('GPUMapMode', { READ: 1 });
  vi.stubGlobal('GPUTextureUsage', {
    TEXTURE_BINDING: 1,
    RENDER_ATTACHMENT: 2,
    COPY_SRC: 4,
    COPY_DST: 8,
  });
  return import('./figment');
}

function createFakeDevice(width, height) {
  const pixelBytes = new Uint8Array(width * height * 4);
  for (let i = 0; i < pixelBytes.length; i++) pixelBytes[i] = i & 0xff;

  const bytesPerRow = Math.ceil((width * 4) / 256) * 256;
  const padded = new Uint8Array(bytesPerRow * height);
  for (let y = 0; y < height; y++) {
    padded.set(pixelBytes.subarray(y * width * 4, (y + 1) * width * 4), y * bytesPerRow);
  }

  function makeStagingBuffer() {
    let mapped = false;
    return {
      destroy: vi.fn(),
      mapAsync: vi.fn(async () => {
        mapped = true;
      }),
      getMappedRange: vi.fn(() => padded.buffer),
      unmap: vi.fn(() => {
        mapped = true;
      }),
      get _mapped() {
        return mapped;
      },
    };
  }

  const device = {
    createBuffer: vi.fn(() => makeStagingBuffer()),
    createCommandEncoder: vi.fn(() => ({
      copyTextureToBuffer: vi.fn(),
      finish: vi.fn(() => 'commands'),
    })),
    createTexture: vi.fn(() => ({
      createView: vi.fn(() => 'view'),
      destroy: vi.fn(),
    })),
  };
  const queue = { submit: vi.fn() };
  return { device, queue, pixelBytes };
}

describe('RenderTarget readback reentrancy', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  test('concurrent readPixelsRaw calls use separate readback instances', async () => {
    const figment = await loadFigmentWithGpuStubs();
    const { device, queue } = createFakeDevice(2, 2);
    figment._setDeviceForTesting(device, queue);

    const target = new figment.RenderTarget({ label: 'test' });
    target.setSize(2, 2);

    // Start two concurrent reads
    const p1 = target.readPixelsRaw();
    const p2 = target.readPixelsRaw();

    const [r1, r2] = await Promise.all([p1, p2]);

    // Both should succeed and return the right dimensions
    expect(r1.width).toBe(2);
    expect(r1.height).toBe(2);
    expect(r2.width).toBe(2);
    expect(r2.height).toBe(2);

    // Two readbacks needed two staging buffers
    expect(device.createBuffer).toHaveBeenCalledTimes(2);

    // After both complete, the target should not be busy
    expect(target._readbackBusy).toBe(false);

    // Persistent readback should still be attached
    expect(target._readback).not.toBeNull();

    target.destroy();
  });

  test('destroy tears down the readback instance', async () => {
    const figment = await loadFigmentWithGpuStubs();
    const { device, queue } = createFakeDevice(2, 2);
    figment._setDeviceForTesting(device, queue);

    const target = new figment.RenderTarget({ label: 'test' });
    target.setSize(2, 2);

    await target.readPixelsRaw();
    expect(target._readback).not.toBeNull();

    target.destroy();
    expect(target._readback).toBeNull();
    expect(target._readbackBusy).toBe(false);
  });
});
