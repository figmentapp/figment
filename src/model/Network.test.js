import { beforeAll, describe, expect, test, vi } from 'vitest';

let Network;

beforeAll(async () => {
  globalThis.window = globalThis.window || {};
  globalThis.AudioContext = class AudioContext {};
  globalThis.GPUTextureUsage = {
    TEXTURE_BINDING: 1,
    RENDER_ATTACHMENT: 2,
    COPY_SRC: 4,
    COPY_DST: 8,
  };

  const mod = await import('./Network.js');
  Network = mod.default;
});

describe('Network frame queue', () => {
  test('serializes concurrent doFrame calls instead of overlapping render passes', async () => {
    const network = new Network({ findByType: () => undefined, nodeTypes: [] });
    let inFlight = 0;
    let maxInFlight = 0;
    let callCount = 0;

    network.nodes = [];
    network._dag.nodeOrder = [];
    network._renderPass = vi.fn(async () => {
      callCount += 1;
      inFlight += 1;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await new Promise((resolve) => setTimeout(resolve, 0));
      inFlight -= 1;
    });

    await Promise.all([network.doFrame(), network.doFrame()]);

    expect(callCount).toBe(2);
    expect(maxInFlight).toBe(1);
  });
});
