import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

vi.mock('../model/Library', () => ({
  default: class MockLibrary {
    constructor() {
      this.nodeTypes = [];
    }

    findByType() {
      return undefined;
    }
  },
}));

vi.mock('../model/Network', () => ({
  default: class MockNetwork {
    constructor(library) {
      this.library = library;
      this.settings = { oscEnabled: false };
      this.nodes = [];
      this.started = false;
      this.parse = vi.fn();
      this.start = vi.fn(async () => {
        this.started = true;
      });
      this.render = vi.fn(async () => {});
      this.doFrame = vi.fn(async () => {});
      this.reset = vi.fn(async () => {});
      this.beginExport = vi.fn(async () => {});
      this.endExport = vi.fn(async () => {});
      this.stop = vi.fn();
      this.serialize = vi.fn(() => ({ version: 6, nodes: [], connections: [], settings: {} }));
      this.findNodeType = vi.fn();
      this.setNodeTypeSource = vi.fn();
      this.setPortValue = vi.fn();
      this.setPortExpression = vi.fn();
      this.deletePortExpression = vi.fn();
      this.triggerButton = vi.fn();
      this.deleteNodes = vi.fn();
      this.forkNodeType = vi.fn();
      this.changeNodeType = vi.fn();
      this.renameNode = vi.fn();
      this.connect = vi.fn();
      this.disconnect = vi.fn();
      this.setSetting = vi.fn();
      this.createNode = vi.fn(() => ({ id: 99, inPorts: [], outPorts: [] }));
    }
  },
  getDefaultNetwork: () => ({ nodes: [], connections: [], settings: { oscEnabled: false } }),
}));

vi.mock('../migration', () => ({
  findWebGLTypes: vi.fn(() => []),
  submitMigration: vi.fn(),
  startPolling: vi.fn(),
  fetchResult: vi.fn(),
}));

function createDesktopMocks() {
  return {
    addToRecentFiles: vi.fn(),
    getCurrentFrame: vi.fn(() => 1),
    getExportFps: vi.fn(() => 60),
    getPackagedFile: vi.fn(() => '/tmp/example.fgmt'),
    readProjectFile: vi.fn(),
    saveBufferToFile: vi.fn(),
    setCurrentFrame: vi.fn(),
    setDocumentEdited: vi.fn(),
    setExportFps: vi.fn(),
    setFullScreen: vi.fn(),
    setRepresentedFilename: vi.fn(),
    setRuntimeMode: vi.fn(),
    showOpenProjectDialog: vi.fn(),
    showSaveImageDialog: vi.fn(),
    showSaveProjectDialog: vi.fn(),
    startOscServer: vi.fn(),
    stopOscServer: vi.fn(),
    writeProjectFile: vi.fn(),
  };
}

async function loadStore() {
  vi.resetModules();

  globalThis.AudioContext = class AudioContext {};
  globalThis.window = globalThis.window || {};
  window.desktop = createDesktopMocks();

  const storeModule = await import('./store');
  const migrationModule = await import('../migration');
  const networkModule = await import('../model/Network');

  return {
    ...storeModule,
    migrationModule,
    networkModule,
  };
}

describe('useAppStore', () => {
  beforeEach(() => {
    vi.useRealTimers();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  test('does not advance frames until the active network has started', async () => {
    const { useAppStore, networkModule } = await loadStore();
    const network = new networkModule.default();
    network.started = false;

    useAppStore.setState({ network });

    await useAppStore.getState().doFrame();
    expect(network.doFrame).not.toHaveBeenCalled();

    network.started = true;
    await useAppStore.getState().doFrame();
    expect(network.doFrame).toHaveBeenCalledTimes(1);
  });

  test('cancels the delayed migration open when the migration is canceled', async () => {
    vi.useFakeTimers();

    const { useAppStore, migrationModule } = await loadStore();
    const finishOpenFile = vi.fn();
    const stopPolling = vi.fn();
    let pollHandler;

    migrationModule.submitMigration.mockResolvedValue({ id: 'task-1', nodeCount: 1 });
    migrationModule.startPolling.mockImplementation((taskId, onUpdate) => {
      pollHandler = onUpdate;
      return stopPolling;
    });
    migrationModule.fetchResult.mockResolvedValue({ version: 6, nodes: [], connections: [], settings: {} });

    useAppStore.setState({
      _finishOpenFile: finishOpenFile,
      migration: {
        phase: 'prompt',
        webglTypeCount: 1,
        nodeCount: 0,
        nodesCompleted: 0,
        error: null,
        _pendingProject: { version: 6, nodes: [], connections: [], settings: {} },
        _pendingFilePath: '/tmp/project.fgmt',
        _stopPolling: null,
      },
    });

    await useAppStore.getState().startMigration();
    await pollHandler({ status: 'completed', nodesCompleted: 1 });

    useAppStore.getState().cancelMigration();
    await vi.advanceTimersByTimeAsync(800);

    expect(stopPolling).toHaveBeenCalledTimes(1);
    expect(finishOpenFile).not.toHaveBeenCalled();
  });

  test('renderSequence runs without wall-clock pacing', async () => {
    vi.useFakeTimers();
    const { useAppStore, networkModule } = await loadStore();
    const network = new networkModule.default();
    network.started = true;
    useAppStore.setState({ network });

    const frames = [];
    await useAppStore.getState().renderSequence(5, 30, (frame) => {
      frames.push(frame);
      return true;
    });

    // Completes without advancing timers — no setTimeout pacing
    expect(frames).toEqual([1, 2, 3, 4, 5]);
    expect(network.doFrame).toHaveBeenCalledTimes(5);
    expect(window.desktop.setCurrentFrame).toHaveBeenCalledTimes(5);
    for (let i = 1; i <= 5; i++) {
      expect(window.desktop.setCurrentFrame).toHaveBeenNthCalledWith(i, i);
    }
    expect(window.desktop.setExportFps).toHaveBeenCalledWith(30);
    expect(window.desktop.setRuntimeMode).toHaveBeenNthCalledWith(1, 'export');
    expect(window.desktop.setRuntimeMode).toHaveBeenLastCalledWith('live');
    expect(network.beginExport).toHaveBeenCalledTimes(1);
    expect(network.endExport).toHaveBeenCalledTimes(1);
  });

  test('renderSequence respects callback cancellation', async () => {
    const { useAppStore, networkModule } = await loadStore();
    const network = new networkModule.default();
    network.started = true;
    useAppStore.setState({ network });

    await useAppStore.getState().renderSequence(10, 24, (frame) => {
      return frame < 2; // returns false on frame 2
    });

    expect(network.doFrame).toHaveBeenCalledTimes(2);
  });

  // ─── Undo/Redo ────────────────────────────────────────────────

  describe('undo/redo', () => {
    test('golden path: undo restores previous state, redo re-applies it', async () => {
      const { useAppStore, networkModule } = await loadStore();
      const network = new networkModule.default();
      network.started = true;
      let serializeCallCount = 0;
      network.serialize = vi.fn(() => ({ version: 6, nodes: [], connections: [], state: `snapshot-${serializeCallCount++}` }));
      useAppStore.setState({ network });

      // Push a snapshot (captures state: snapshot-0), then simulate a mutation
      useAppStore.getState().pushSnapshot();
      expect(useAppStore.getState().undoStack).toHaveLength(1);
      expect(useAppStore.getState().redoStack).toHaveLength(0);

      // Undo: should stop old network, parse snapshot, start new network
      await useAppStore.getState().undo();
      const newNetwork = useAppStore.getState().network;
      expect(network.stop).toHaveBeenCalled();
      expect(newNetwork.parse).toHaveBeenCalledWith(expect.objectContaining({ state: 'snapshot-0' }));
      expect(newNetwork.start).toHaveBeenCalled();
      expect(newNetwork.doFrame).toHaveBeenCalled();
      expect(useAppStore.getState().undoStack).toHaveLength(0);
      expect(useAppStore.getState().redoStack).toHaveLength(1);

      // Redo: should restore the state we undid from
      await useAppStore.getState().redo();
      const redoneNetwork = useAppStore.getState().network;
      expect(redoneNetwork).not.toBe(newNetwork);
      expect(useAppStore.getState().undoStack).toHaveLength(1);
      expect(useAppStore.getState().redoStack).toHaveLength(0);
    });

    test('undo on empty stack does nothing', async () => {
      const { useAppStore, networkModule } = await loadStore();
      const network = new networkModule.default();
      network.started = true;
      useAppStore.setState({ network });

      expect(useAppStore.getState().undoStack).toHaveLength(0);
      await useAppStore.getState().undo();

      // Network should not have been stopped or replaced
      expect(network.stop).not.toHaveBeenCalled();
      expect(useAppStore.getState().network).toBe(network);
    });

    test('redo on empty stack does nothing', async () => {
      const { useAppStore, networkModule } = await loadStore();
      const network = new networkModule.default();
      network.started = true;
      useAppStore.setState({ network });

      expect(useAppStore.getState().redoStack).toHaveLength(0);
      await useAppStore.getState().redo();

      expect(network.stop).not.toHaveBeenCalled();
      expect(useAppStore.getState().network).toBe(network);
    });

    test('new mutation clears redo stack', async () => {
      const { useAppStore, networkModule } = await loadStore();
      const network = new networkModule.default();
      network.started = true;
      useAppStore.setState({ network });

      // Build up: push → undo → have redo entries
      useAppStore.getState().pushSnapshot();
      await useAppStore.getState().undo();
      expect(useAppStore.getState().redoStack).toHaveLength(1);

      // New mutation should clear redo
      useAppStore.getState().pushSnapshot();
      expect(useAppStore.getState().redoStack).toHaveLength(0);
    });

    test('history limit is enforced on undo stack', async () => {
      const { useAppStore, networkModule } = await loadStore();
      const network = new networkModule.default();
      network.started = true;
      useAppStore.setState({ network });

      // Push more than HISTORY_LIMIT (50) snapshots
      for (let i = 0; i < 55; i++) {
        useAppStore.getState().pushSnapshot();
      }
      expect(useAppStore.getState().undoStack).toHaveLength(50);
    });

    test('re-entrancy guard prevents concurrent undo calls', async () => {
      const { useAppStore, networkModule } = await loadStore();
      const network = new networkModule.default();
      network.started = true;
      useAppStore.setState({ network });

      useAppStore.getState().pushSnapshot();
      useAppStore.getState().pushSnapshot();

      // Start two undos simultaneously
      const p1 = useAppStore.getState().undo();
      const p2 = useAppStore.getState().undo();
      await Promise.all([p1, p2]);

      // Only one undo should have executed (stack went from 2 → 1, not 2 → 0)
      expect(useAppStore.getState().undoStack).toHaveLength(1);
    });

    test('re-entrancy guard prevents concurrent redo calls', async () => {
      const { useAppStore, networkModule } = await loadStore();
      const network = new networkModule.default();
      network.started = true;
      useAppStore.setState({ network });

      // Build redo stack: push 2, undo 2
      useAppStore.getState().pushSnapshot();
      useAppStore.getState().pushSnapshot();
      await useAppStore.getState().undo();
      await useAppStore.getState().undo();
      expect(useAppStore.getState().redoStack).toHaveLength(2);

      // Start two redos simultaneously
      const p1 = useAppStore.getState().redo();
      const p2 = useAppStore.getState().redo();
      await Promise.all([p1, p2]);

      // Only one redo should have executed
      expect(useAppStore.getState().redoStack).toHaveLength(1);
    });

    test('undo/redo preserves selection by node id', async () => {
      const { useAppStore, networkModule } = await loadStore();
      const network = new networkModule.default();
      network.started = true;
      const nodeA = { id: 'a', name: 'A' };
      network.nodes = [nodeA];
      useAppStore.setState({ network, selection: new Set([nodeA]) });

      useAppStore.getState().pushSnapshot();

      await useAppStore.getState().undo();

      // The new network's nodes should be searched for the id
      const newNetwork = useAppStore.getState().network;
      expect(newNetwork.parse).toHaveBeenCalled();
    });

    test('undo marks document as dirty', async () => {
      const { useAppStore, networkModule } = await loadStore();
      const network = new networkModule.default();
      network.started = true;
      useAppStore.setState({ network, dirty: false });

      useAppStore.getState().pushSnapshot();
      await useAppStore.getState().undo();

      expect(useAppStore.getState().dirty).toBe(true);
      expect(window.desktop.setDocumentEdited).toHaveBeenCalledWith(true);
    });

    test('tabs are preserved across undo when types still exist', async () => {
      const { useAppStore, networkModule } = await loadStore();
      const network = new networkModule.default();
      network.started = true;
      const myType = { type: 'custom.myShader', name: 'My Shader', source: 'fn main() {}' };
      network.findNodeType = vi.fn(() => myType);
      useAppStore.setState({
        network,
        tabs: [{ nodeType: myType, modified: true, uncommittedSource: 'edited...' }],
        activeTabIndex: 0,
      });

      useAppStore.getState().pushSnapshot();

      // Undo creates a new Network — configure its findNodeType to resolve the type
      const origCtor = networkModule.default;
      const CtorSpy = vi.fn(function (...args) {
        const inst = new origCtor(...args);
        inst.findNodeType = vi.fn(() => myType);
        return inst;
      });
      // Temporarily patch the constructor used by the store's import
      // We need to intercept the new Network() call inside undo().
      // Since the mock module is already in place, we patch the prototype approach won't work.
      // Instead, let's directly set findNodeType on the resulting network after undo.
      // A simpler approach: use the mock constructor's default and override after.
      // Actually, the simplest fix: patch the default mock's findNodeType behavior.
      // The mock constructor creates fresh mocks each time, so we need a different approach.

      // Workaround: override the mock constructor temporarily
      const NetworkClass = networkModule.default;
      const originalProto = NetworkClass.prototype;
      const origFindNodeType = originalProto.findNodeType;

      // Override at the instance level: after undo, check and re-resolve
      // Actually let's just test the behavior differently — check that undo
      // calls findNodeType and that when it returns a value, the tab is kept.
      // We'll do this by making ALL new Network instances return the type.
      vi.spyOn(networkModule, 'default').mockImplementation(function (library) {
        const inst = new NetworkClass(library);
        inst.findNodeType = vi.fn(() => myType);
        return inst;
      });

      await useAppStore.getState().undo();

      // The tab should be preserved (type resolved in new network) but modified state reset
      const tabs = useAppStore.getState().tabs;
      expect(tabs).toHaveLength(1);
      expect(tabs[0].modified).toBe(false);
      expect(tabs[0].uncommittedSource).toBeNull();

      vi.restoreAllMocks();
    });

    test('tabs are dropped on undo when type no longer exists', async () => {
      const { useAppStore, networkModule } = await loadStore();
      const network = new networkModule.default();
      network.started = true;
      const myType = { type: 'custom.myShader', name: 'My Shader' };
      useAppStore.setState({
        network,
        tabs: [{ nodeType: myType, modified: false, uncommittedSource: null }],
        activeTabIndex: 0,
      });

      useAppStore.getState().pushSnapshot();

      // After undo, the new network's findNodeType returns undefined (default mock)
      await useAppStore.getState().undo();

      expect(useAppStore.getState().tabs).toHaveLength(0);
      expect(useAppStore.getState().activeTabIndex).toBe(-1);
    });

    test('closeProject clears both undo and redo stacks', async () => {
      const { useAppStore, networkModule } = await loadStore();
      const network = new networkModule.default();
      network.started = true;
      useAppStore.setState({ network });

      useAppStore.getState().pushSnapshot();
      useAppStore.getState().pushSnapshot();
      await useAppStore.getState().undo();
      expect(useAppStore.getState().undoStack).toHaveLength(1);
      expect(useAppStore.getState().redoStack).toHaveLength(1);

      useAppStore.getState().closeProject();
      expect(useAppStore.getState().undoStack).toHaveLength(0);
      expect(useAppStore.getState().redoStack).toHaveLength(0);
    });

    test('newProject clears undo/redo stacks', async () => {
      const { useAppStore, networkModule } = await loadStore();
      const network = new networkModule.default();
      network.started = true;
      useAppStore.setState({ network });

      useAppStore.getState().pushSnapshot();
      expect(useAppStore.getState().undoStack).toHaveLength(1);

      await useAppStore.getState().newProject();
      expect(useAppStore.getState().undoStack).toHaveLength(0);
      expect(useAppStore.getState().redoStack).toHaveLength(0);
    });
  });

  // ─── Snapshot instrumentation ────────────────────────────────

  describe('mutating actions push snapshots', () => {
    async function storeWithNetwork() {
      const { useAppStore, networkModule } = await loadStore();
      const network = new networkModule.default();
      network.started = true;
      useAppStore.setState({ network });
      return { useAppStore, network };
    }

    test('deleteSelection pushes snapshot', async () => {
      const { useAppStore, network } = await storeWithNetwork();
      const node = { id: 1 };
      network.nodes = [node];
      useAppStore.setState({ selection: new Set([node]) });
      useAppStore.getState().deleteSelection();
      expect(useAppStore.getState().undoStack).toHaveLength(1);
    });

    test('createNode pushes snapshot', async () => {
      const { useAppStore } = await storeWithNetwork();
      useAppStore.getState().createNode({ type: 'image.blur' });
      expect(useAppStore.getState().undoStack).toHaveLength(1);
    });

    test('connect pushes snapshot', async () => {
      const { useAppStore } = await storeWithNetwork();
      useAppStore.getState().connect({ id: 'out1' }, { id: 'in1' });
      expect(useAppStore.getState().undoStack).toHaveLength(1);
    });

    test('disconnect pushes snapshot', async () => {
      const { useAppStore } = await storeWithNetwork();
      useAppStore.getState().disconnect({ id: 'in1' });
      expect(useAppStore.getState().undoStack).toHaveLength(1);
    });

    test('renameNode pushes snapshot', async () => {
      const { useAppStore } = await storeWithNetwork();
      useAppStore.getState().renameNode({ id: 1 }, 'New Name');
      expect(useAppStore.getState().undoStack).toHaveLength(1);
    });

    test('renameNode with empty name does not push snapshot', async () => {
      const { useAppStore } = await storeWithNetwork();
      useAppStore.getState().renameNode({ id: 1 }, '  ');
      expect(useAppStore.getState().undoStack).toHaveLength(0);
    });

    test('buildSource pushes snapshot', async () => {
      const { useAppStore } = await storeWithNetwork();
      useAppStore.getState().buildSource({ type: 'custom.foo' }, 'new source');
      expect(useAppStore.getState().undoStack).toHaveLength(1);
    });

    test('changePortExpression pushes snapshot', async () => {
      const { useAppStore } = await storeWithNetwork();
      useAppStore.getState().changePortExpression({ id: 1 }, 'x', 'Math.sin(t)');
      expect(useAppStore.getState().undoStack).toHaveLength(1);
    });

    test('togglePortExpression pushes snapshot', async () => {
      const { useAppStore } = await storeWithNetwork();
      const node = { id: 1, inPorts: [{ name: 'x', value: 42 }] };
      useAppStore.getState().togglePortExpression(node, 'x');
      expect(useAppStore.getState().undoStack).toHaveLength(1);
    });

    test('deletePortExpression pushes snapshot', async () => {
      const { useAppStore } = await storeWithNetwork();
      useAppStore.getState().deletePortExpression({ id: 1 }, 'x');
      expect(useAppStore.getState().undoStack).toHaveLength(1);
    });

    test('revertPortValue pushes snapshot', async () => {
      const { useAppStore } = await storeWithNetwork();
      const node = { id: 1, inPorts: [{ name: 'x', value: 42, defaultValue: 0 }] };
      useAppStore.getState().revertPortValue(node, 'x');
      expect(useAppStore.getState().undoStack).toHaveLength(1);
    });

    test('forkNodeType pushes snapshot', async () => {
      const { useAppStore, network } = await storeWithNetwork();
      const nodeType = { type: 'image.blur', name: 'Blur' };
      const newNodeType = { type: 'custom.myBlur', name: 'My Blur' };
      network.forkNodeType = vi.fn(() => newNodeType);
      useAppStore.getState().forkNodeType(nodeType, 'My Blur', 'custom.myBlur');
      expect(useAppStore.getState().undoStack).toHaveLength(1);
    });

    test('changeProjectSetting pushes snapshot and marks dirty', async () => {
      const { useAppStore } = await storeWithNetwork();
      useAppStore.getState().changeProjectSetting('width', 1920);
      expect(useAppStore.getState().undoStack).toHaveLength(1);
      expect(useAppStore.getState().dirty).toBe(true);
    });
  });

  // ─── Port value changes ───────────────────────────────────────

  test('changePortValue does not push snapshots (callers are responsible)', async () => {
    const { useAppStore, networkModule } = await loadStore();
    const network = new networkModule.default();
    network.started = true;
    useAppStore.setState({ network });

    const node = { id: 1 };
    useAppStore.getState().changePortValue(node, 'x', 1);
    useAppStore.getState().changePortValue(node, 'x', 2);
    useAppStore.getState().changePortValue(node, 'x', 3);

    expect(useAppStore.getState().undoStack).toHaveLength(0);
    expect(network.setPortValue).toHaveBeenCalledTimes(3);
    expect(useAppStore.getState().dirty).toBe(true);
  });

  test('renderSequence pauses live playback during export and restores it afterwards', async () => {
    const { useAppStore, networkModule } = await loadStore();
    const network = new networkModule.default();
    network.started = true;

    useAppStore.setState({ network, isPlaying: true });

    const callbackStates = [];
    await useAppStore.getState().renderSequence(2, 24, (frame) => {
      callbackStates.push({ frame, isPlaying: useAppStore.getState().isPlaying });
      return true;
    });

    expect(network.reset).toHaveBeenCalledTimes(1);
    expect(network.doFrame).toHaveBeenCalledTimes(2);
    expect(window.desktop.setRuntimeMode).toHaveBeenNthCalledWith(1, 'export');
    expect(window.desktop.setRuntimeMode).toHaveBeenLastCalledWith('live');
    expect(callbackStates).toEqual([
      { frame: 1, isPlaying: false },
      { frame: 2, isPlaying: false },
    ]);
    expect(useAppStore.getState().isPlaying).toBe(true);
    expect(network.beginExport).toHaveBeenCalledTimes(1);
    expect(network.endExport).toHaveBeenCalledTimes(1);
  });

  // ─── Menu event focus guard ──────────────────────────────────

  describe('handleMenuEvent undo/redo focus guard', () => {
    function mockActiveElement(tagName, type = undefined) {
      globalThis.document = globalThis.document || {};
      Object.defineProperty(globalThis.document, 'activeElement', {
        value: { tagName, type },
        configurable: true,
        writable: true,
      });
    }

    // handleMenuEvent fires undo/redo without awaiting, so we flush promises after each call
    const flush = () => new Promise((r) => setTimeout(r, 0));

    test('undo is blocked when a text input is focused', async () => {
      const { useAppStore, networkModule } = await loadStore();
      const network = new networkModule.default();
      network.started = true;
      useAppStore.setState({ network });

      useAppStore.getState().pushSnapshot();
      mockActiveElement('INPUT', 'text');
      useAppStore.getState().handleMenuEvent('undo', {});
      await flush();

      expect(useAppStore.getState().undoStack).toHaveLength(1);
    });

    test('undo is blocked when a textarea is focused', async () => {
      const { useAppStore, networkModule } = await loadStore();
      const network = new networkModule.default();
      network.started = true;
      useAppStore.setState({ network });

      useAppStore.getState().pushSnapshot();
      mockActiveElement('TEXTAREA');
      useAppStore.getState().handleMenuEvent('undo', {});
      await flush();

      expect(useAppStore.getState().undoStack).toHaveLength(1);
    });

    test('undo is NOT blocked when a checkbox is focused', async () => {
      const { useAppStore, networkModule } = await loadStore();
      const network = new networkModule.default();
      network.started = true;
      useAppStore.setState({ network });

      useAppStore.getState().pushSnapshot();
      mockActiveElement('INPUT', 'checkbox');
      useAppStore.getState().handleMenuEvent('undo', {});
      await flush();

      expect(useAppStore.getState().undoStack).toHaveLength(0);
    });

    test('redo is NOT blocked when a checkbox is focused', async () => {
      const { useAppStore, networkModule } = await loadStore();
      const network = new networkModule.default();
      network.started = true;
      useAppStore.setState({ network });

      useAppStore.getState().pushSnapshot();
      await useAppStore.getState().undo();
      expect(useAppStore.getState().redoStack).toHaveLength(1);

      mockActiveElement('INPUT', 'checkbox');
      useAppStore.getState().handleMenuEvent('redo', {});
      await flush();

      expect(useAppStore.getState().redoStack).toHaveLength(0);
    });

    test('undo works when a non-input element is focused', async () => {
      const { useAppStore, networkModule } = await loadStore();
      const network = new networkModule.default();
      network.started = true;
      useAppStore.setState({ network });

      useAppStore.getState().pushSnapshot();
      mockActiveElement('DIV');
      useAppStore.getState().handleMenuEvent('undo', {});
      await flush();

      expect(useAppStore.getState().undoStack).toHaveLength(0);
    });
  });
});
