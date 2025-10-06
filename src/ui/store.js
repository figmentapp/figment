import { create } from 'zustand';
import Library from '../model/Library';
import Network, { getDefaultNetwork } from '../model/Network';
import { Point } from '../g';
import { upgradeProject } from '../file-format';
import { PORT_TYPE_IMAGE } from '../model/Port';

// Centralized app UI state using Zustand
const initialLibrary = new Library();
const initialNetwork = new Network(initialLibrary);
initialNetwork.parse(getDefaultNetwork());

export const useAppStore = create((set, get) => ({
  // Project + UI state
  filePath: undefined,
  dirty: false,
  library: initialLibrary,
  network: initialNetwork,
  tabs: [],
  activeTabIndex: -1,
  selection: new Set(),
  showNodeDialog: false,
  showForkDialog: false,
  showRenderDialog: false,
  showProjectSettingsDialog: false,
  showNodeRenameDialog: false,
  nodeToRename: null,
  forkDialogNodeType: null,
  lastNetworkPoint: new Point(0, 0),
  editorSplitterWidth: 350,
  fullscreen: false,
  version: 1,
  isPlaying: true,
  oscServerPort: null,
  oscMessageFrequencies: [],
  oscMessageMap: new Map(),
  midiMessageMap: new Map(),

  // Generic setter helper
  set: (partial) => set(partial),

  // Helper to set dirty flag and update macOS window state
  setDirty(dirty) {
    window.desktop.setDocumentEdited(dirty);
    set({ dirty });
  },

  // Frame and runtime
  async doFrame() {
    const { network } = get();
    if (network) {
      await network.doFrame();
    }
  },
  async startNetwork() {
    const { network } = get();
    if (!network) return;
    await network.start();
    await network.render();
  },
  start() {
    set({ isPlaying: true });
    const { network } = get();
    if (network && network.settings.oscEnabled) {
      const port = parseInt(network.settings.oscPort) || 8888;
      window.desktop.startOscServer(port);
    }
  },
  stop() {
    set({ isPlaying: false });
  },

  // UI helpers
  forceRedraw() {
    set((s) => ({ version: s.version + 1 }));
  },
  toggleFullscreen() {
    const { fullscreen } = get();
    const next = !fullscreen;
    set({ fullscreen: next });
    window.desktop.setFullScreen(next);
    if (next) document.documentElement.classList.add('hide-cursor');
    else document.documentElement.classList.remove('hide-cursor');
  },

  // File ops
  setFilePath(filePath, dirty = false) {
    window.desktop.setRepresentedFilename(filePath);
    get().setDirty(dirty);
    set({ filePath });
  },
  async saveFile() {
    const { filePath, tabs } = get();
    // Auto-build any modified tabs before saving
    const modifiedTabs = tabs.filter((t) => t.modified && t.uncommittedSource !== null);
    for (const tab of modifiedTabs) {
      get().buildSource(tab.nodeType, tab.uncommittedSource);
    }
    if (!filePath) return get().saveFileAs();
    await get().saveFileTo(filePath);
    get().setDirty(false);
  },
  async saveFileAs() {
    const { tabs } = get();
    // Auto-build any modified tabs before saving
    const modifiedTabs = tabs.filter((t) => t.modified && t.uncommittedSource !== null);
    for (const tab of modifiedTabs) {
      get().buildSource(tab.nodeType, tab.uncommittedSource);
    }
    const filePath = await window.desktop.showSaveProjectDialog();
    if (!filePath) return;
    await get().saveFileTo(filePath);
    get().setFilePath(filePath);
  },
  async saveFileTo(filePath) {
    const { network } = get();
    const json = network.serialize();
    const contents = JSON.stringify(json, null, 2);
    await window.desktop.writeProjectFile(filePath, contents);
    window.desktop.addToRecentFiles(filePath);
  },
  async openFileDialog() {
    const filePath = await window.desktop.showOpenProjectDialog();
    if (!filePath) return;
    await get().openFile(filePath);
  },
  async openFile(filePath) {
    const s = get();
    get().closeProject();
    set({ isPlaying: false });
    const contents = await window.desktop.readProjectFile(filePath);
    let project = JSON.parse(contents);
    try {
      project = upgradeProject(project);
    } catch (error) {
      alert(
        `This file is created with a newer version of Figment. Please download the latest version at figmentapp.com. (${error.message})`,
      );
    }
    const net = new Network(s.library);
    set({ filePath, network: net, selection: new Set() });
    net.parse(project);
    await net.start();
    net.doFrame();
    get().setFilePath(filePath);
    get().start();
    window.desktop.addToRecentFiles(filePath);
  },
  closeProject() {
    const { network } = get();
    if (network) network.stop();
    get().setDirty(false);
    set({ filePath: undefined, tabs: [], activeTabIndex: -1, selection: new Set() });
    window.desktop.stopOscServer();
  },
  async newProject() {
    get().closeProject();
    const library = new Library();
    const network = new Network(library);
    network.parse(getDefaultNetwork());
    await network.start();
    await network.render();
    set({ library, network, selection: new Set() });
    get().setFilePath(undefined);
    get().start();
  },

  // Tabs
  newCodeTab(node, callback) {
    const s = get();
    const nodeType = s.network.findNodeType(node.type);
    const existingTabIndex = s.tabs.findIndex((t) => t.nodeType.type === nodeType.type);
    if (existingTabIndex >= 0) {
      set({ activeTabIndex: existingTabIndex });
      return;
    }
    const newTabs = structuredClone(s.tabs);
    newTabs.push({ nodeType, modified: false, uncommittedSource: null });
    set({ tabs: newTabs, activeTabIndex: newTabs.length - 1 });
    if (callback) callback();
  },
  selectTab(index) {
    set({ activeTabIndex: index });
  },
  closeTab(index) {
    const { tabs } = get();
    const tab = tabs[index];
    if (tab.modified) {
      const close = confirm('You have unsaved changes. Are you sure you want to close this tab?');
      if (!close) return;
    }
    const newTabs = tabs.filter((_, i) => i !== index);
    set({ tabs: newTabs, activeTabIndex: newTabs.length - 1 });
  },

  // Selection
  selectNode(node) {
    const selection = new Set([node]);
    set({ selection });
  },
  toggleSelectNode(node) {
    const selection = new Set(get().selection);
    if (selection.has(node)) selection.delete(node);
    else selection.add(node);
    set({ selection });
  },
  selectNodes(nodes) {
    const selection = new Set(get().selection);
    Array.from(nodes).forEach((n) => selection.add(n));
    set({ selection });
  },
  clearSelection() {
    set({ selection: new Set() });
  },
  deleteSelection() {
    const { selection, network } = get();
    network.deleteNodes(Array.from(selection));
    get().setDirty(true);
    set({ selection: new Set() });
  },

  // Node source
  sourceModified(nodeType, source, modified = true) {
    const { tabs } = get();
    const index = tabs.findIndex((t) => t.nodeType.type === nodeType.type);
    if (index !== -1) {
      const newTabs = structuredClone(tabs);
      newTabs[index].modified = modified;
      newTabs[index].uncommittedSource = modified ? source : null;
      set({ tabs: newTabs });
      if (modified) {
        get().setDirty(true);
      }
    }
  },
  buildSource(nodeType, source) {
    const { network } = get();
    network.setNodeTypeSource(nodeType, source);
    get().sourceModified(nodeType, null, false);
    get().setDirty(true);
    get().forceRedraw();
  },

  // Ports
  changePortValue(node, portName, value) {
    const { network } = get();
    network.setPortValue(node, portName, value);
    get().setDirty(true);
    get().forceRedraw();
  },
  changePortExpression(node, portName, expression) {
    const { network } = get();
    network.setPortExpression(node, portName, expression);
    get().setDirty(true);
    get().forceRedraw();
  },
  revertPortValue(node, portName) {
    const port = node.inPorts.find((p) => p.name === portName);
    const defaultValue = JSON.parse(JSON.stringify(port.defaultValue));
    const { network } = get();
    network.setPortValue(node, portName, defaultValue);
    get().setDirty(true);
    get().forceRedraw();
  },
  togglePortExpression(node, portName) {
    const port = node.inPorts.find((p) => p.name === portName);
    const expression = JSON.stringify(port.value);
    const { network } = get();
    network.setPortExpression(node, portName, expression);
    get().setDirty(true);
    get().forceRedraw();
  },
  deletePortExpression(node, portName) {
    const { network } = get();
    network.deletePortExpression(node, portName);
    get().setDirty(true);
    get().forceRedraw();
  },
  triggerButton(node, port) {
    const { network } = get();
    network.triggerButton(node, port);
    get().forceRedraw();
  },

  // Dialogs + nodes
  openNodeDialog(pt) {
    const p = pt || new Point(Math.floor(Math.random() * 500), Math.floor(Math.random() * 500));
    set({ showNodeDialog: true, lastNetworkPoint: p });
  },
  closeNodeDialog() {
    set({ showNodeDialog: false });
  },
  openForkDialog(nodeType) {
    set({ showForkDialog: true, forkDialogNodeType: nodeType });
  },
  closeForkDialog() {
    set({ showForkDialog: false });
  },
  forkNodeType(nodeType, newName, newTypeName, nodes = []) {
    const { network, tabs } = get();
    const newNodeType = network.forkNodeType(nodeType, newName, newTypeName);
    for (const node of nodes) network.changeNodeType(node, newNodeType);
    const newTabs = tabs.filter((t) => t.nodeType.type !== nodeType.type);
    const existingTabIndex = newTabs.findIndex((t) => t.nodeType.type === newNodeType.type);
    get().setDirty(true);
    if (existingTabIndex >= 0) {
      set({ tabs: newTabs, showForkDialog: false, activeTabIndex: existingTabIndex });
    } else {
      newTabs.push({ nodeType: newNodeType, modified: false, uncommittedSource: null });
      set({ tabs: newTabs, showForkDialog: false, activeTabIndex: newTabs.length - 1 });
    }
    get().forceRedraw();
  },
  openRenderDialog() {
    set({ showRenderDialog: true });
  },
  closeRenderDialog() {
    set({ showRenderDialog: false });
  },
  openProjectSettingsDialog() {
    set({ showProjectSettingsDialog: true });
  },
  closeProjectSettingsDialog() {
    set({ showProjectSettingsDialog: false });
  },
  createNode(nodeType) {
    const { lastNetworkPoint, network } = get();
    network.createNode(nodeType.type, lastNetworkPoint.x, lastNetworkPoint.y);
    get().setDirty(true);
    set({ showNodeDialog: false });
    get().forceRedraw();
  },
  openNodeRenameDialog(node) {
    set({ showNodeRenameDialog: true, nodeToRename: node });
  },
  closeNodeRenameDialog() {
    set({ showNodeRenameDialog: false });
  },
  renameNode(node, newName) {
    if (newName.trim().length === 0) return;
    const { network } = get();
    network.renameNode(node, newName);
    get().setDirty(true);
    set({ showNodeRenameDialog: false });
    get().forceRedraw();
  },
  connect(outPort, inPort) {
    const { network } = get();
    network.connect(outPort, inPort);
    get().setDirty(true);
    get().forceRedraw();
  },
  disconnect(inPort) {
    const { network } = get();
    network.disconnect(inPort);
    get().setDirty(true);
    get().forceRedraw();
  },

  // Exporting
  async exportImage(node, filePath, imageType = 'image/png', imageQuality = 1.0) {
    const outPort = node.outPorts[0];
    if (outPort.type !== PORT_TYPE_IMAGE) return;
    const framebuffer = outPort.value;
    const imageData = new ImageData(framebuffer.width, framebuffer.height);
    framebuffer.bind();
    window.gl.readPixels(0, 0, framebuffer.width, framebuffer.height, gl.RGBA, gl.UNSIGNED_BYTE, imageData.data);
    framebuffer.unbind();
    const canvas = new OffscreenCanvas(framebuffer.width, framebuffer.height);
    const ctx = canvas.getContext('2d');
    ctx.putImageData(imageData, 0, 0);
    const blob = await canvas.convertToBlob({ type: imageType, quality: imageQuality });
    const pngBuffer = await blob.arrayBuffer();
    await window.desktop.saveBufferToFile(pngBuffer, filePath);
  },
  async exportSelectedImage() {
    const filePath = await window.desktop.showSaveImageDialog();
    if (!filePath) return;
    const { selection } = get();
    if (selection.size !== 1) return;
    const node = selection.values().next().value;
    await get().exportImage(node, filePath);
  },

  async renderSequence(frameCount, frameRate, callback) {
    const { network } = get();
    network.reset();
    window.desktop.setRuntimeMode('export');
    for (let currentFrame = 1; currentFrame <= frameCount; currentFrame++) {
      window.desktop.setCurrentFrame(currentFrame);
      const startTime = Date.now();
      await network.doFrame();
      const continueRendering = callback(currentFrame);
      if (!continueRendering) break;
      const endTime = Date.now();
      const frameTime = endTime - startTime;
      const frameDuration = 1000 / frameRate;
      const waitTime = Math.max(0, frameDuration - frameTime);
      await new Promise((resolve) => setTimeout(resolve, waitTime));
    }
    window.desktop.setRuntimeMode('live');
  },

  viewNodeSource() {
    const { selection } = get();
    if (selection.size !== 1) return;
    const node = selection.values().next().value;
    get().newCodeTab(node);
  },

  changeProjectSetting(setting, value) {
    const { network } = get();
    network.setSetting(setting, value);
    if (setting === 'oscEnabled') {
      if (value) {
        const port = parseInt(network.settings.oscPort) || 8888;
        if (typeof port !== 'number') {
          console.error('Invalid port number', port);
          return;
        }
        window.desktop.startOscServer(port);
      } else {
        window.desktop.stopOscServer();
      }
    } else if (setting === 'oscPort') {
      const port = parseInt(value) || 8888;
      if (typeof port !== 'number') {
        console.error('Invalid port number', port);
        return;
      }
      if (network.settings.oscEnabled) {
        window.desktop.startOscServer(port);
      }
    }
    get().forceRedraw();
  },

  // External events
  handleOscEvent(name, args) {
    if (name === 'start-server') {
      const { port } = args;
      set({ oscServerPort: port });
    } else if (name === 'stop-server') {
      set({ oscServerPort: null });
    } else if (name === 'message') {
      let { address, args: argList } = args;
      if (argList.length === 1) argList = argList[0];
      get().oscMessageMap.set(address, argList);
    } else if (name === 'message-frequencies') {
      const frequencies = args;
      set({ oscMessageFrequencies: frequencies });
    }
  },
  handleMidiEvent(data) {
    const { channel, controller, value } = data;
    get().midiMessageMap.set(`${channel}-${controller}`, value);
  },
  handleMenuEvent(name, args) {
    switch (name) {
      case 'new':
        get().newProject();
        break;
      case 'open':
        if (args.filePath) get().openFile(args.filePath);
        else get().openFileDialog();
        break;
      case 'save':
        get().saveFile();
        break;
      case 'save-as':
        get().saveFileAs();
        break;
      case 'export-image':
        get().exportSelectedImage();
        break;
      case 'view-node-source':
        get().viewNodeSource();
        break;
      case 'project-settings-dialog':
        set({ showProjectSettingsDialog: true });
        break;
      case 'render-dialog':
        get().openRenderDialog();
        break;
      case 'enter-full-screen':
        get().toggleFullscreen();
        break;
      case 'revert-to-default': {
        const { nodeId, portName } = args;
        const node = get().network.nodes.find((n) => n.id === nodeId);
        if (node) get().revertPortValue(node, portName);
        break;
      }
      case 'edit-expression': {
        const { nodeId, portName } = args;
        const node = get().network.nodes.find((n) => n.id === nodeId);
        if (node) get().togglePortExpression(node, portName);
        break;
      }
      case 'delete-expression': {
        const { nodeId, portName } = args;
        const node = get().network.nodes.find((n) => n.id === nodeId);
        if (node) get().deletePortExpression(node, portName);
        break;
      }
      default:
        console.error('Unknown menu event:', name);
    }
  },
}));
