import { beforeAll, beforeEach, describe, expect, test } from 'vitest';

// Integration test: exercises the real Network serialize/parse roundtrip
// to verify undo/redo captures and restores all port types correctly.

let Network;

const TOGGLE_NODE_SOURCE = `
const playIn = node.toggleIn('play', true);
const speedIn = node.numberIn('speed', 1.0);
node.onStart = () => {};
node.onFrame = () => {};
`;

function createMiniLibrary() {
  return {
    nodeTypes: [{ type: 'test.toggleNode', name: 'Toggle Node', source: TOGGLE_NODE_SOURCE }],
    findByType(type) {
      return this.nodeTypes.find((nt) => nt.type === type);
    },
  };
}

beforeAll(async () => {
  globalThis.window = globalThis.window || {};
  globalThis.AudioContext = class AudioContext {};
  globalThis.GPUTextureUsage = {
    TEXTURE_BINDING: 1,
    RENDER_ATTACHMENT: 2,
    COPY_SRC: 4,
    COPY_DST: 8,
  };

  const mod = await import('../model/Network.js');
  Network = mod.default;
});

describe('undo/redo serialize roundtrip', () => {
  let library;

  beforeEach(() => {
    library = createMiniLibrary();
  });

  function createNetworkWithToggleNode() {
    const network = new Network(library);
    const node = network.createNode('test.toggleNode', 100, 100);
    return { network, node };
  }

  function findPort(node, portName) {
    return node.inPorts.find((p) => p.name === portName);
  }

  test('toggle port at default value survives serialize → parse roundtrip', () => {
    const { network, node } = createNetworkWithToggleNode();
    const playPort = findPort(node, 'play');

    // Toggle is at default (true)
    expect(playPort.value).toBe(true);

    // Serialize and parse into a new network
    const snapshot = network.serialize();
    const restored = new Network(library);
    restored.parse(snapshot);

    const restoredNode = restored.nodes.find((n) => n.type === 'test.toggleNode');
    const restoredPort = findPort(restoredNode, 'play');
    expect(restoredPort.value).toBe(true);
  });

  test('toggle port changed from default survives serialize → parse roundtrip', () => {
    const { network, node } = createNetworkWithToggleNode();
    const playPort = findPort(node, 'play');

    // Change toggle to false (non-default)
    network.setPortValue(node, 'play', false);
    expect(playPort.value).toBe(false);

    const snapshot = network.serialize();
    const restored = new Network(library);
    restored.parse(snapshot);

    const restoredNode = restored.nodes.find((n) => n.type === 'test.toggleNode');
    const restoredPort = findPort(restoredNode, 'play');
    expect(restoredPort.value).toBe(false);
  });

  test('undo restores toggle port to previous value (true → false → undo → true)', () => {
    const { network, node } = createNetworkWithToggleNode();
    const playPort = findPort(node, 'play');
    expect(playPort.value).toBe(true);

    // Simulate pushSnapshot: capture state BEFORE the change
    const snapshotBefore = network.serialize();

    // Change toggle to false
    network.setPortValue(node, 'play', false);
    expect(playPort.value).toBe(false);

    // Simulate undo: restore from snapshotBefore
    const restored = new Network(library);
    restored.parse(snapshotBefore);

    const restoredNode = restored.nodes.find((n) => n.type === 'test.toggleNode');
    const restoredPort = findPort(restoredNode, 'play');
    expect(restoredPort.value).toBe(true);
  });

  test('undo restores number port to previous value', () => {
    const { network, node } = createNetworkWithToggleNode();
    const speedPort = findPort(node, 'speed');
    expect(speedPort.value).toBe(1.0);

    const snapshotBefore = network.serialize();

    network.setPortValue(node, 'speed', 2.5);
    expect(speedPort.value).toBe(2.5);

    const restored = new Network(library);
    restored.parse(snapshotBefore);

    const restoredNode = restored.nodes.find((n) => n.type === 'test.toggleNode');
    const restoredPort = findPort(restoredNode, 'speed');
    expect(restoredPort.value).toBe(1.0);
  });

  test('full undo/redo cycle: toggle false → undo → redo', () => {
    const { network, node } = createNetworkWithToggleNode();

    // Capture initial state (play=true)
    const snapshot0 = network.serialize();

    // Change play to false
    network.setPortValue(node, 'play', false);
    const snapshot1 = network.serialize();

    // UNDO: restore snapshot0 (play should be true)
    const net1 = new Network(library);
    net1.parse(snapshot0);
    const node1 = net1.nodes.find((n) => n.type === 'test.toggleNode');
    expect(findPort(node1, 'play').value).toBe(true);

    // REDO: restore snapshot1 (play should be false)
    const net2 = new Network(library);
    net2.parse(snapshot1);
    const node2 = net2.nodes.find((n) => n.type === 'test.toggleNode');
    expect(findPort(node2, 'play').value).toBe(false);
  });

  test('multiple toggle changes create correct undo chain', () => {
    const { network, node } = createNetworkWithToggleNode();

    // State 0: play=true (default)
    const snap0 = network.serialize();

    // State 1: play=false
    network.setPortValue(node, 'play', false);
    const snap1 = network.serialize();

    // State 2: play=true again
    network.setPortValue(node, 'play', true);
    const snap2 = network.serialize();

    // Undo from state 2 → state 1 (play=false)
    const net1 = new Network(library);
    net1.parse(snap1);
    expect(findPort(net1.nodes[0], 'play').value).toBe(false);

    // Undo from state 1 → state 0 (play=true)
    const net0 = new Network(library);
    net0.parse(snap0);
    expect(findPort(net0.nodes[0], 'play').value).toBe(true);
  });
});
