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
    getPackagedFile: vi.fn(() => '/tmp/example.fgmt'),
    readProjectFile: vi.fn(),
    saveBufferToFile: vi.fn(),
    setDocumentEdited: vi.fn(),
    setFullScreen: vi.fn(),
    setRepresentedFilename: vi.fn(),
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
});
