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

describe('Network start with failing nodes', () => {
  // Mirrors a node that polls an external service (e.g. Max on 127.0.0.1:7477) and keeps retrying
  // inside onStart while the service is down: the fetch fails with ECONNREFUSED, the node swallows it.
  const pollingSource = `
    const out = node.numberOut('value', 0);
    node.onStart = async () => {
      while (!globalThis.__serviceUp) {
        try {
          await fetch('http://127.0.0.1:1/state');
        } catch (_) {}
        await new Promise((resolve) => setTimeout(resolve, 10));
      }
    };
    node.onRender = () => { out.set(42); };
  `;
  const throwingSource = `
    node.numberOut('value', 0);
    node.onStart = async () => { throw new Error('connection refused'); };
    node.onRender = () => {};
  `;
  const okSource = `
    const out = node.numberOut('value', 0);
    node.onStart = () => {};
    node.onRender = () => { out.set(7); };
  `;

  function makeNetwork(types) {
    const network = new Network({ findByType: () => undefined, nodeTypes: [] });
    network.parse({
      types: types.map(([type, source]) => ({ name: type, type, source })),
      nodes: types.map(([type], i) => ({ id: i + 1, type, name: type, x: 0, y: 0 })),
      connections: [],
    });
    return network;
  }

  test('a node whose onStart never settles does not block the rest of the patch', async () => {
    globalThis.__serviceUp = false;
    const network = makeNetwork([
      ['project.maxIn', pollingSource],
      ['project.ok', okSource],
    ]);
    const [maxIn, ok] = network.nodes;

    await network.start({ graceMs: 50 });
    expect(network.started).toBe(true);
    await network.doFrame();

    expect(ok.outPorts[0].value).toBe(7);
    expect(maxIn.isStarting).toBe(true);
    expect(maxIn.isDirty).toBe(true);
    expect(maxIn.outPorts[0].value).toBe(0);

    // Once the service comes up, the node finishes starting and renders on the next frame.
    globalThis.__serviceUp = true;
    await vi.waitFor(() => expect(maxIn.isStarting).toBe(false));
    await network.doFrame();
    expect(maxIn.outPorts[0].value).toBe(42);
    expect(maxIn.error).toBe(null);
    network.stop();
  });

  test('a node whose onStart throws is marked errored and the others still render', async () => {
    const network = makeNetwork([
      ['project.broken', throwingSource],
      ['project.ok', okSource],
    ]);
    const [broken, ok] = network.nodes;
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

    await network.start();
    await network.doFrame();

    expect(broken.error).toMatch(/connection refused/);
    expect(ok.outPorts[0].value).toBe(7);
    consoleError.mockRestore();
  });

  test('waitForAll waits for every onStart to settle', async () => {
    globalThis.__serviceUp = false;
    const network = makeNetwork([['project.maxIn', pollingSource]]);
    const started = network.start({ waitForAll: true, graceMs: 10 });
    let done = false;
    started.then(() => (done = true));
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(done).toBe(false);
    globalThis.__serviceUp = true;
    await started;
    expect(network.nodes[0].isStarting).toBe(false);
  });
});
