import * as Comlink from 'comlink';
import React, { Component } from 'react';
import Stats from 'three/examples/jsm/libs/stats.module';
import NetworkProxy from '../model/NetworkProxy';
import { Point } from '../g';
import Editor from './Editor';
import Viewer from './Viewer';
import ParamsEditor from './ParamsEditor';
import NodeDialog from './NodeDialog';
import Splitter from './Splitter';
import ForkDialog from './ForkDialog';
import NodeRenameDialog from './NodeRenameDialog';
import RenderDialog from './RenderDialog';
import ProjectSettingsDialog from './ProjectSettingsDialog';
import { upgradeProject } from '../file-format';
import { initExpressionContext } from '../expr';

function randInt(min, max) {
  return Math.floor(min + Math.random() * (max - min));
}

window.stats = new Stats();
window.stats.dom.style.top = '';
window.stats.dom.style.bottom = '0';

export default class App extends Component {
  constructor(props) {
    super(props);
    const lastNetworkPoint = new Point(0, 0);
    this.state = {
      filePath: this.props.filePath,
      dirty: false,
      network: null,
      tabs: [],
      activeTabIndex: -1,
      selection: new Set(),
      showNodeDialog: false,
      showForkDialog: false,
      showRenderDialog: false,
      showProjectSettingsDialog: false,
      forkDialogNodeType: null,
      lastNetworkPoint,
      editorSplitterWidth: 350,
      fullscreen: false,
      version: 1,
      isPlaying: true,
      oscServerPort: null,
      oscMessageFrequencies: [],
    };
    this.mainRef = React.createRef();
    this.oscMessageMap = new Map();
    this.midiMessageMap = new Map();
    initExpressionContext({ _osc: this.oscMessageMap, _midi: this.midiMessageMap });
    this._onOpenFile = this._onOpenFile.bind(this);
    this._onMenuEvent = this._onMenuEvent.bind(this);
    this._openFile = this._openFile.bind(this);
    this._onNewCodeTab = this._onNewCodeTab.bind(this);
    this._onSelectTab = this._onSelectTab.bind(this);
    this._onCloseTab = this._onCloseTab.bind(this);
    this._onSelectNode = this._onSelectNode.bind(this);
    this._onToggleSelectNode = this._onToggleSelectNode.bind(this);
    this._onSelectNodes = this._onSelectNodes.bind(this);
    this._onClearSelection = this._onClearSelection.bind(this);
    this._onDeleteSelection = this._onDeleteSelection.bind(this);
    this._onSourceModified = this._onSourceModified.bind(this);
    this._onBuildSource = this._onBuildSource.bind(this);
    this._onChangePortValue = this._onChangePortValue.bind(this);
    this._onChangePortExpression = this._onChangePortExpression.bind(this);
    this._onRevertPortValue = this._onRevertPortValue.bind(this);
    this._onTriggerButton = this._onTriggerButton.bind(this);
    this._onShowNodeDialog = this._onShowNodeDialog.bind(this);
    this._onHideNodeDialog = this._onHideNodeDialog.bind(this);
    this._onShowForkDialog = this._onShowForkDialog.bind(this);
    this._onHideForkDialog = this._onHideForkDialog.bind(this);
    this._onshowRenderDialog = this._onshowRenderDialog.bind(this);
    this._onHideRenderDialog = this._onHideRenderDialog.bind(this);
    this._onShowProjectSettingsDialog = this._onShowProjectSettingsDialog.bind(this);
    this._onHideProjectSettingsDialog = this._onHideProjectSettingsDialog.bind(this);
    this._onForkNodeType = this._onForkNodeType.bind(this);
    this._onCreateNode = this._onCreateNode.bind(this);
    this._onShowNodeRenameDialog = this._onShowNodeRenameDialog.bind(this);
    this._onHideNodeRenameDialog = this._onHideNodeRenameDialog.bind(this);
    this._onToggleFullscreen = this._onToggleFullscreen.bind(this);
    this._onRenameNode = this._onRenameNode.bind(this);
    this._onConnect = this._onConnect.bind(this);
    this._onDisconnect = this._onDisconnect.bind(this);
    this._onExportImage = this._onExportImage.bind(this);
    this._exportImage = this._exportImage.bind(this);
    this._renderSequence = this._renderSequence.bind(this);
    this._onViewNodeSource = this._onViewNodeSource.bind(this);
    this._onChangeProjectSetting = this._onChangeProjectSetting.bind(this);
    this._onOscEvent = this._onOscEvent.bind(this);
    this._onMidiEvent = this._onMidiEvent.bind(this);
    this._onFrame = this._onFrame.bind(this);
    this._onStart = this._onStart.bind(this);
    this._onStop = this._onStop.bind(this);
    this._onKeyDown = this._onKeyDown.bind(this);
    this._forceRedraw = this._forceRedraw.bind(this);
    this._onNetworkViewportChange = this._onNetworkViewportChange.bind(this);
    this.viewerRef = React.createRef();
    this._lastViewportSent = null;
  }

  async componentDidMount() {
    const worker = new Worker(new URL('../model/RenderWorker.js', import.meta.url), { type: 'module' });
    this.renderWorker = Comlink.wrap(worker);
    const appPath = window.desktop.getAppPath();
    const renderCanvas = new OffscreenCanvas(1, 1);
    const { nodeTypes } = await this.renderWorker.init(appPath, Comlink.transfer(renderCanvas, [renderCanvas]));
    this.nodeTypes = nodeTypes;
    const networkSchema = await this.renderWorker.loadNetwork();
    const networkProxy = new NetworkProxy(networkSchema, { nodeTypes });

    const selection = new Set();
    const firstNode = networkProxy.nodes[0];
    if (firstNode) {
      selection.add(firstNode);
    }

    this.setState({ network: networkProxy, selection }, () => {
      // await this.state.network.start();
      // await this.state.network.render();
      this._onStart();
      window.requestAnimationFrame(this._onFrame);
      window.addEventListener('keydown', this._onKeyDown);
      window.addEventListener('resize', this._forceRedraw);
      window.app = this;
      window.desktop.registerListener('menu', this._onMenuEvent);
      window.desktop.registerListener('osc', this._onOscEvent);
      window.desktop.registerListener('midi', this._onMidiEvent);
      if (this.state.filePath) {
        this._openFile(this.state.filePath);
      }
    });
  }

  componentWillUnmount() {
    window.removeEventListener('keydown', this._onKeyDown);
    window.app = undefined;
  }

  _forceRedraw() {
    this.setState({ version: this.state.version + 1 });
  }

  _onKeyDown(e) {
    if (e.keyCode === 27 && this.state.fullscreen) {
      this._onToggleFullscreen();
    }
  }

  _onMenuEvent(name, args) {
    switch (name) {
      case 'new':
        this._newProject();
        break;
      case 'open':
        if (args.filePath) {
          this._openFile(args.filePath);
        } else {
          this._onOpenFile();
        }
        break;
      case 'save':
        this._onSaveFile();
        break;
      case 'save-as':
        this._onSaveFileAs();
        break;
      case 'export-image':
        this._onExportImage();
        break;
      case 'view-node-source':
        this._onViewNodeSource();
        break;
      case 'project-settings-dialog':
        this.setState({ showProjectSettingsDialog: true });
        break;
      case 'render-dialog':
        this._onshowRenderDialog();
        break;
      case 'enter-full-screen':
        this._onToggleFullscreen();
        break;
      case 'revert-to-default':
        {
          const { nodeId, portName } = args;
          const node = this.state.network.nodes.find((n) => n.id === nodeId);
          if (node) {
            this._onRevertPortValue(node, portName);
          }
        }
        break;
      case 'edit-expression':
        {
          const { nodeId, portName } = args;
          const node = this.state.network.nodes.find((n) => n.id === nodeId);
          if (node) {
            this._onTogglePortExpression(node, portName);
          }
        }
        break;
      case 'delete-expression':
        {
          const { nodeId, portName } = args;
          const node = this.state.network.nodes.find((n) => n.id === nodeId);
          if (node) {
            this._onDeletePortExpression(node, portName);
          }
        }
        break;
      default:
        console.error('Unknown menu event:', name);
    }
  }

  async _newProject() {
    this._close();
    const library = new Library();
    const network = new Network(library);
    network.parse(getDefaultNetwork());
    await network.start();
    await network.render();
    // network.doFrame();
    this._onStart();
    this.setState({ network, selection: new Set() });
    this._setFilePath(undefined);
  }

  async _onOpenFile() {
    const filePath = await window.desktop.showOpenProjectDialog();
    // const window = remote.BrowserWindow.getFocusedWindow();
    // const result = await remote.dialog.showOpenDialog(window, {
    //   properties: ['openFile'],
    //   filters: FILE_FILTERS,
    // });
    if (!filePath) return;
    await this._openFile(filePath);
  }

  async _openFile(filePath) {
    this._close();
    this.setState({ isPlaying: false }, this._realOpenFile.bind(this, filePath));
  }

  async _realOpenFile(filePath) {
    const contents = await window.desktop.readProjectFile(filePath);
    // const contents = await fs.readFile(filePath, 'utf-8');
    let project = JSON.parse(contents);
    try {
      project = upgradeProject(project);
    } catch (error) {
      alert(
        `This file is created with a newer version of Figment. Please download the latest version at figmentapp.com. (${error.message})`,
      );
    }
    const network = new Network(this.state.library);

    // remote.app.addRecentDocument(filePath);
    this.setState({ filePath, network, selection: new Set() }, async () => {
      network.parse(project);
      await network.start();
      network.doFrame();
      this._setFilePath(filePath);
      this._onStart();
    });
    window.desktop.addToRecentFiles(filePath);
  }

  async _onSaveFile() {
    if (!this.state.filePath) return this._onSaveFileAs();
    await this._saveFile(this.state.filePath);
    this.setState({ dirty: false });
  }

  async _onSaveFileAs() {
    const filePath = await window.desktop.showSaveProjectDialog();
    if (!filePath) return;
    await this._saveFile(filePath);
    this._setFilePath(filePath);
  }

  async _saveFile(filePath) {
    const json = this.state.network.serialize();
    const contents = JSON.stringify(json, null, 2);
    await window.desktop.writeProjectFile(filePath, contents);
    window.desktop.addToRecentFiles(filePath);
  }

  _close() {
    if (this.state.network) {
      this.state.network.stop();
      // document.getElementById('viewer').innerHTML = '';
    }
    this.setState({
      filePath: undefined,
      dirty: false,
      tabs: [],
      activeTabIndex: -1,
      selection: new Set(),
    });
    window.desktop.stopOscServer();
    // FIXME: check for unsaved changes
  }

  _setFilePath(filePath, dirty = false) {
    window.desktop.setRepresentedFilename(filePath);
    window.desktop.setDocumentEdited(dirty);
    this.setState({ filePath, dirty });
  }

  _onNewCodeTab(node, callback) {
    const nodeType = this.state.network.findNodeType(node.type);
    const existingTabIndex = this.state.tabs.findIndex((t) => t.nodeType.type === nodeType.type);
    if (existingTabIndex >= 0) {
      this.setState({ activeTabIndex: existingTabIndex });
      return;
    }
    const newTabs = structuredClone(this.state.tabs);
    newTabs.push({ nodeType, modified: false });
    this.setState({ tabs: newTabs, activeTabIndex: newTabs.length - 1 }, callback);
  }

  _onSelectTab(index) {
    this.setState({ activeTabIndex: index });
  }

  _onCloseTab(index) {
    const tab = this.state.tabs[index];
    if (tab.modified) {
      const closeTab = confirm('You have unsaved changes. Are you sure you want to close this tab?');
      if (closeTab) {
        const newTabs = this.state.tabs.filter((_, i) => i !== index);
        this.setState({ tabs: newTabs, activeTabIndex: newTabs.length - 1 });
      }
    } else {
      const newTabs = this.state.tabs.filter((_, i) => i !== index);
      this.setState({ tabs: newTabs, activeTabIndex: newTabs.length - 1 });
    }
  }

  _onSelectNode(node) {
    const { selection } = this.state;
    selection.clear();
    selection.add(node);
    // if (selection.has(node)) {
    //   selection.delete(node);
    // } else {
    //   selection.add(node);
    // }
    this.forceUpdate();
    //this.setState({ selection: })
  }

  _onToggleSelectNode(node) {
    const { selection } = this.state;
    if (selection.has(node)) {
      selection.delete(node);
    } else {
      selection.add(node);
    }
    this.forceUpdate();
  }

  _onSelectNodes(nodes) {
    const { selection } = this.state;
    Array.from(nodes).forEach((node) => {
      selection.add(node);
    });
    this.forceUpdate();
  }

  _onClearSelection() {
    const { selection } = this.state;
    selection.clear();
    this.forceUpdate();
  }

  _onDeleteSelection() {
    const { selection } = this.state;
    this.state.network.deleteNodes(Array.from(selection));
    this.setState({ selection: new Set() });
  }

  _onSourceModified(nodeType, modified = true) {
    const { tabs } = this.state;
    const index = tabs.findIndex((t) => t.nodeType.type === nodeType.type);
    if (index !== -1) {
      const newTabs = structuredClone(tabs);
      newTabs[index].modified = modified;
      this.setState({ tabs: newTabs });
    }
  }

  _onBuildSource(nodeType, source) {
    console.assert(typeof nodeType === 'object');
    this.state.network.setNodeTypeSource(nodeType, source);
    this._onSourceModified(nodeType, false);
    this.forceUpdate();
  }

  _onChangePortValue(node, portName, value) {
    this.state.network.setPortValue(node, portName, value);
    this.forceUpdate();
  }

  _onChangePortExpression(node, portName, expression) {
    this.state.network.setPortExpression(node, portName, expression);
    this.forceUpdate();
  }

  _onRevertPortValue(node, portName) {
    const port = node.inPorts.find((p) => p.name === portName);
    console.assert(port);
    const defaultValue = JSON.parse(JSON.stringify(port.defaultValue));
    this.state.network.setPortValue(node, portName, defaultValue);
    this.forceUpdate();
  }

  _onTogglePortExpression(node, portName) {
    const port = node.inPorts.find((p) => p.name === portName);
    console.assert(port);
    console.assert(port._value.type === 'value');
    const expression = JSON.stringify(port.value);
    this.state.network.setPortExpression(node, portName, expression);
    this.forceUpdate();
  }

  _onDeletePortExpression(node, portName) {
    this.state.network.deletePortExpression(node, portName);
    this.forceUpdate();
  }

  _onTriggerButton(node, port) {
    this.state.network.triggerButton(node, port);
    this.forceUpdate();
  }

  _onShowNodeDialog(pt) {
    if (!pt) {
      pt = new Point(randInt(0, 500), randInt(0, 500));
    }
    this.setState({ showNodeDialog: true, lastNetworkPoint: pt });
  }

  _onHideNodeDialog() {
    this.setState({ showNodeDialog: false });
  }

  _onShowForkDialog(nodeType) {
    this.setState({ showForkDialog: true, forkDialogNodeType: nodeType });
  }

  _onHideForkDialog() {
    this.setState({ showForkDialog: false });
  }

  _onForkNodeType(nodeType, newName, newTypeName, nodes = []) {
    const { network } = this.state;
    const newNodeType = network.forkNodeType(nodeType, newName, newTypeName);
    for (const node of nodes) {
      network.changeNodeType(node, newNodeType);
    }
    this._onNewCodeTab(newNodeType, (state) => {
      const newTabs = this.state.tabs.filter((t) => t.nodeType.type !== nodeType.type);
      this.setState({
        tabs: newTabs,
        showForkDialog: false,
        activeTabIndex: newTabs.length - 1,
      });
    });
  }

  _onshowRenderDialog() {
    this.setState({ showRenderDialog: true });
  }

  _onHideRenderDialog() {
    this.setState({ showRenderDialog: false });
  }

  _onShowProjectSettingsDialog() {
    this.setState({ showProjectSettingsDialog: true });
  }

  _onHideProjectSettingsDialog() {
    this.setState({ showProjectSettingsDialog: false });
  }

  _onCreateNode(nodeType) {
    console.assert(typeof nodeType === 'object');
    const pt = this.state.lastNetworkPoint;
    const node = this.state.network.createNode(nodeType.type, pt.x, pt.y);
    this.setState({ showNodeDialog: false });
  }

  _onShowNodeRenameDialog(node) {
    this.setState({ showNodeRenameDialog: true, nodeToRename: node });
  }

  _onHideNodeRenameDialog() {
    this.setState({ showNodeRenameDialog: false });
  }

  _onToggleFullscreen() {
    const fullscreen = !this.state.fullscreen;
    this.setState({ fullscreen });
    window.desktop.setFullScreen(fullscreen);
    if (fullscreen) {
      document.documentElement.classList.add('hide-cursor');
    } else {
      document.documentElement.classList.remove('hide-cursor');
    }
  }

  _onRenameNode(node, newName) {
    if (newName.trim().length === 0) return;
    this.state.network.renameNode(node, newName);
    this.setState({ showNodeRenameDialog: false });
  }

  _onConnect(outPort, inPort) {
    this.state.network.connect(outPort, inPort);
  }

  _onDisconnect(inPort) {
    this.state.network.disconnect(inPort);
  }

  async _exportImage(node, filePath, imageType = 'image/png', imageQuality = 1.0) {
    const result = await this.renderWorker.captureNodePreview(node.id);
    if (!result?.success || !result.bitmap) {
      console.warn('No preview available for export');
      return;
    }
    const { bitmap, width, height } = result;
    try {
      const canvas = new OffscreenCanvas(width, height);
      const ctx = canvas.getContext('2d');
      ctx.drawImage(bitmap, 0, 0, width, height);
      const blob = await canvas.convertToBlob({ type: imageType, quality: imageQuality });
      const pngBuffer = await blob.arrayBuffer();
      // Write the buffer to the given file path.
      await window.desktop.saveBufferToFile(pngBuffer, filePath);
    } finally {
      try {
        bitmap.close();
      } catch (_) {
        // ignore
      }
    }
  }

  async _onExportImage() {
    const filePath = await window.desktop.showSaveImageDialog();
    if (!filePath) return;
    // Get the selected node. Bail out if there is more than one.
    if (this.state.selection.size !== 1) return;
    const node = this.state.selection.values().next().value;
    await this._exportImage(node, filePath);
  }

  async _renderSequence(frameCount, frameRate, callback) {
    this.state.network.reset();

    window.desktop.setRuntimeMode('export');

    for (let currentFrame = 1; currentFrame <= frameCount; currentFrame++) {
      // Globally set the current frame.
      window.desktop.setCurrentFrame(currentFrame);
      // Note the start time when we started rendering.
      const startTime = Date.now();
      // Render the current frame.
      await this.state.network.doFrame();

      // Call the callback with the current frame number.
      const continueRendering = callback(currentFrame);
      if (!continueRendering) break;
      // Wait until the frame is done.
      const endTime = Date.now();
      const frameTime = endTime - startTime;
      const frameDuration = 1000 / frameRate;
      const waitTime = Math.max(0, frameDuration - frameTime);
      await new Promise((resolve) => setTimeout(resolve, waitTime));
    }

    window.desktop.setRuntimeMode('live');
  }

  _onViewNodeSource() {
    // Get the selected node. Bail out if there is more than one.
    if (this.state.selection.size !== 1) return;
    const node = this.state.selection.values().next().value;
    this._onNewCodeTab(node);
  }

  _onChangeProjectSetting(setting, value) {
    this.state.network.setSetting(setting, value);

    if (setting === 'oscEnabled') {
      if (value) {
        const port = parseInt(this.state.network.settings.oscPort) || 8888;
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
      if (this.state.network.settings.oscEnabled) {
        window.desktop.startOscServer(port);
      }
    }

    this.forceUpdate();
  }

  _onNetworkViewportChange(viewport) {
    if (!viewport) return;
    if (this._lastViewportSent) {
      const last = this._lastViewportSent;
      if (
        last.width === viewport.width &&
        last.height === viewport.height &&
        last.x === viewport.x &&
        last.y === viewport.y &&
        last.scale === viewport.scale
      ) {
        return;
      }
    }
    this._lastViewportSent = { ...viewport };
    if (this.renderWorker?.setPreviewViewport) {
      this.renderWorker.setPreviewViewport({ ...viewport });
    }
  }

  _onOscEvent(name, args) {
    if (name === 'start-server') {
      const { port } = args;
      this.setState({ oscServerPort: port });
    } else if (name === 'stop-server') {
      this.setState({ oscServerPort: null });
    } else if (name === 'message') {
      let { address, args: argList } = args;
      if (argList.length === 1) {
        argList = argList[0];
      }
      this.oscMessageMap.set(address, argList);
    } else if (name === 'message-frequencies') {
      const frequencies = args;
      this.setState({ oscMessageFrequencies: frequencies });
    }
  }
  _onMidiEvent(data) {
    const { channel, controller, value } = data;
    this.midiMessageMap.set(`${channel}-${controller}`, value);
  }

  async _onFrame() {
    if (!this.state.isPlaying) return;
    if (this.state.network) {
      window.stats.begin();
      const result = await this.renderWorker.renderFrame();
      if (result.success) {
        if (result.frame) {
          this.viewerRef.current?.setFrame(result.frame);
        }
        if ('previewOverlay' in result) {
          this.state.network.updatePreviewOverlay(result.previewOverlay || null);
        }
      } else if (!result.busy) {
        console.error('Render error:', result.error);
      }
      window.stats.end();
    }
    window.requestAnimationFrame(this._onFrame);
  }

  _onStart() {
    this.setState({ isPlaying: true }, () => window.requestAnimationFrame(this._onFrame));
    if (this.state.network.settings.oscEnabled) {
      const port = parseInt(this.state.network.settings.oscPort) || 8888;
      window.desktop.startOscServer(port);
    }
  }

  _onStop() {
    this.setState({ isPlaying: false });
  }

  render() {
    const {
      network,
      selection,
      tabs,
      activeTabIndex,
      showNodeDialog,
      showForkDialog,
      forkDialogNodeType,
      mainSplitterWidth,
      editorSplitterWidth,
      showNodeRenameDialog,
      showRenderDialog,
      showProjectSettingsDialog,
      nodeToRename,
      fullscreen,
    } = this.state;
    if (!network) return null;
    if (fullscreen) {
      return (
        <div className="app">
          <Viewer ref={this.viewerRef} network={network} fullscreen={fullscreen} onToggleFullscreen={this._onToggleFullscreen} />
        </div>
      );
    }
    return (
      <>
        <main ref={this.mainRef}>
          <Editor
            tabs={tabs}
            activeTabIndex={activeTabIndex}
            network={network}
            selection={selection}
            onNewCodeTab={this._onNewCodeTab}
            onSelectTab={this._onSelectTab}
            onCloseTab={this._onCloseTab}
            onSelectNode={this._onSelectNode}
            onToggleSelectNode={this._onToggleSelectNode}
            onSelectNodes={this._onSelectNodes}
            onClearSelection={this._onClearSelection}
            onDeleteSelection={this._onDeleteSelection}
            onSourceModified={this._onSourceModified}
            onBuildSource={this._onBuildSource}
            onShowNodeDialog={this._onShowNodeDialog}
            onShowForkDialog={this._onShowForkDialog}
            onConnect={this._onConnect}
            onDisconnect={this._onDisconnect}
            onViewportChange={this._onNetworkViewportChange}
            oscServerPort={this.state.oscServerPort}
            oscMessageFrequencies={this.state.oscMessageFrequencies}
            onClickOsc={this._onShowProjectSettingsDialog}
          />
          <Splitter className="splitter" parentRef={this.mainRef} direction="horizontal" />

          <ParamsEditor
            network={network}
            selection={selection}
            onShowNodeRenameDialog={this._onShowNodeRenameDialog}
            onChangePortValue={this._onChangePortValue}
            _onChangePortExpression={this._onChangePortExpression}
            onRevertPortValue={this._onRevertPortValue}
            onTriggerButton={this._onTriggerButton}
            editorSplitterWidth={editorSplitterWidth}
          />
        </main>
        {/* <Splitter
          direction="vertical"
          size={mainSplitterWidth}
          onChange={(width) => this.setState({ mainSplitterWidth: width })}
        />
  <Viewer ref={this.viewerRef} network={network} fullscreen={false} onToggleFullscreen={this._onToggleFullscreen} /> */}
        {showNodeDialog && <NodeDialog network={network} onCreateNode={this._onCreateNode} onCancel={this._onHideNodeDialog} />}
        {showForkDialog && (
          <ForkDialog
            network={network}
            selection={selection}
            nodeType={forkDialogNodeType}
            onForkNodeType={this._onForkNodeType}
            onCancel={this._onHideForkDialog}
          />
        )}
        {showNodeRenameDialog && (
          <NodeRenameDialog node={nodeToRename} onRenameNode={this._onRenameNode} onCancel={this._onHideNodeRenameDialog} />
        )}
        {showRenderDialog && <RenderDialog network={network} renderSequence={this._renderSequence} onCancel={this._onHideRenderDialog} />}
        {showProjectSettingsDialog && (
          <ProjectSettingsDialog network={network} onChange={this._onChangeProjectSetting} onCancel={this._onHideProjectSettingsDialog} />
        )}
      </>
    );
  }
}
