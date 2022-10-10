import React, { Component } from 'react';
import Network, { getDefaultNetwork } from '../model/Network';
import { Point } from '../g';
import { PORT_TYPE_IMAGE } from '../model/Port';
import Editor from './Editor';
import Viewer from './Viewer';
import ParamsEditor from './ParamsEditor';
import NodeDialog from './NodeDialog';
import Splitter from './Splitter';
import Library from '../model/Library';
import ForkDialog from './ForkDialog';
import NodeRenameDialog from './NodeRenameDialog';
import RenderDialog from './RenderDialog';

function randInt(min, max) {
  return Math.floor(min + Math.random() * (max - min));
}

export default class App extends Component {
  constructor(props) {
    super(props);
    const library = new Library();
    const network = new Network(library);
    network.parse(getDefaultNetwork());
    const lastNetworkPoint = new Point(0, 0);
    this.state = {
      filePath: undefined,
      dirty: false,
      library,
      network,
      tabs: [],
      activeTabIndex: -1,
      selection: new Set(),
      showNodeDialog: false,
      showForkDialog: false,
      showRenderDialog: false,
      forkDialogNodeType: null,
      lastNetworkPoint,
      editorSplitterWidth: 350,
      fullscreen: false,
      version: 1,
      isPlaying: true,
    };
    const firstNode = network.nodes[0];
    if (firstNode) {
      this.state.selection.add(firstNode);
    }
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
    this._onChangeSource = this._onChangeSource.bind(this);
    this._onChangePortValue = this._onChangePortValue.bind(this);
    this._onRevertPortValue = this._onRevertPortValue.bind(this);
    this._onTriggerButton = this._onTriggerButton.bind(this);
    this._onShowNodeDialog = this._onShowNodeDialog.bind(this);
    this._onHideNodeDialog = this._onHideNodeDialog.bind(this);
    this._onShowForkDialog = this._onShowForkDialog.bind(this);
    this._onHideForkDialog = this._onHideForkDialog.bind(this);
    this._onshowRenderDialog = this._onshowRenderDialog.bind(this);
    this._onHideRenderDialog = this._onHideRenderDialog.bind(this);
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
    this._onFrame = this._onFrame.bind(this);
    this._onStart = this._onStart.bind(this);
    this._onStop = this._onStop.bind(this);
    this._onKeyDown = this._onKeyDown.bind(this);
    this._forceRedraw = this._forceRedraw.bind(this);
    this._offscreenCanvas = new OffscreenCanvas(256, 256);
    window.gl = this._offscreenCanvas.getContext('webgl');
  }

  async componentDidMount() {
    await this.state.network.start();
    await this.state.network.render();
    window.requestAnimationFrame(this._onFrame);
    window.addEventListener('keydown', this._onKeyDown);
    window.addEventListener('resize', this._forceRedraw);
    window.app = this;
    window.desktop.registerListener('menu', this._onMenuEvent);
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

  _onMenuEvent(name, filePath) {
    switch (name) {
      case 'new':
        this._newProject();
        break;
      case 'open':
        if (filePath) {
          this._openFile(filePath);
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
      case 'render-dialog':
        this._onshowRenderDialog();
        break;
      case 'enter-full-screen':
        this._onToggleFullscreen();
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
    const json = JSON.parse(contents);
    const network = new Network(this.state.library);

    // remote.app.addRecentDocument(filePath);
    this.setState({ filePath, network, selection: new Set() }, async () => {
      network.parse(json);
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
    // FIXME: check for unsaved changes
  }

  _setFilePath(filePath, dirty = false) {
    // const window = remote.BrowserWindow.getFocusedWindow();
    // if (window) {
    //   // FIXME: how to clear the represented filename?
    //   filePath && window.setRepresentedFilename(filePath);
    //   window.setDocumentEdited(!dirty);
    // }
    this.setState({ filePath, dirty });
  }

  _onNewCodeTab(node, callback) {
    const nodeType = this.state.network.findNodeType(node.type);
    if (this.state.tabs.includes(nodeType)) {
      this.setState({ activeTabIndex: this.state.tabs.indexOf(nodeType) });
      return;
    }
    const { tabs } = this.state;
    tabs.push(nodeType);
    this.setState({ tabs, activeTabIndex: tabs.length - 1 }, callback);
  }

  _onSelectTab(index) {
    this.setState({ activeTabIndex: index });
  }

  _onCloseTab(index) {
    const { tabs } = this.state;
    tabs.splice(index, 1);
    this.setState({ tabs, activeTabIndex: tabs.length - 1 });
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

  _onChangeSource(nodeType, source) {
    console.assert(typeof nodeType === 'object');
    this.state.network.setNodeTypeSource(nodeType, source);
    this.forceUpdate();
  }

  _onChangePortValue(node, portName, value) {
    this.state.network.setPortValue(node, portName, value);
    this.forceUpdate();
  }

  _onRevertPortValue(node, portName) {
    const port = node.inPorts.find((p) => p.name === portName);
    console.assert(port);
    const defaultValue = JSON.parse(JSON.stringify(port.defaultValue));
    this.state.network.setPortValue(node, portName, defaultValue);
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
      const tabs = this.state.tabs.filter((t) => t.type !== nodeType.type);
      this.setState({
        tabs,
        showForkDialog: false,
        activeTabIndex: tabs.length - 1,
      });
    });
  }

  _onshowRenderDialog() {
    this.setState({ showRenderDialog: true });
  }

  _onHideRenderDialog() {
    this.setState({ showRenderDialog: false });
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
    // Get the output image of the node.
    const outPort = node.outPorts[0];
    if (outPort.type !== PORT_TYPE_IMAGE) return;
    const framebuffer = outPort.value;
    // Read out the pixels of the framebuffer.
    const imageData = new ImageData(framebuffer.width, framebuffer.height);
    framebuffer.bind();
    window.gl.readPixels(0, 0, framebuffer.width, framebuffer.height, gl.RGBA, gl.UNSIGNED_BYTE, imageData.data);
    framebuffer.unbind();
    // Put the image data into an offscreen canvas.
    const canvas = new OffscreenCanvas(framebuffer.width, framebuffer.height);
    const ctx = canvas.getContext('2d');
    ctx.putImageData(imageData, 0, 0);
    // Convert the canvas to a PNG blob, then to a buffer.
    const blob = await canvas.convertToBlob({ type: imageType, quality: imageQuality });
    const pngBuffer = await blob.arrayBuffer();
    // Write the buffer to the given file path.
    await window.desktop.saveBufferToFile(pngBuffer, filePath);
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
    window.desktop.setCurrentFrame(1);

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

  async _onFrame() {
    if (!this.state.isPlaying) return;
    if (this.state.network) {
      await this.state.network.doFrame();
    }
    window.requestAnimationFrame(this._onFrame);
  }

  _onStart() {
    this.setState({ isPlaying: true });
    window.requestAnimationFrame(this._onFrame);
  }

  _onStop() {
    this.setState({ isPlaying: false });
  }

  render() {
    const {
      library,
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
      nodeToRename,
      fullscreen,
    } = this.state;
    if (fullscreen) {
      return (
        <div className="app">
          <Viewer
            network={network}
            offscreenCanvas={this._offscreenCanvas}
            fullscreen={fullscreen}
            onToggleFullscreen={this._onToggleFullscreen}
          />
        </div>
      );
    }
    return (
      <div className="app">
        <div className="flex-1 flex flex-row h-screen">
          <Editor
            tabs={tabs}
            activeTabIndex={activeTabIndex}
            style={{ width: `${window.innerWidth - editorSplitterWidth}px` }}
            library={library}
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
            onChangeSource={this._onChangeSource}
            onShowNodeDialog={this._onShowNodeDialog}
            onShowForkDialog={this._onShowForkDialog}
            onConnect={this._onConnect}
            onDisconnect={this._onDisconnect}
            offscreenCanvas={this._offscreenCanvas}
          />
          <Splitter
            direction="vertical"
            size={editorSplitterWidth}
            onChange={(width) => this.setState({ editorSplitterWidth: width })}
            minSize={350}
          />

          <ParamsEditor
            network={network}
            selection={selection}
            onShowNodeRenameDialog={this._onShowNodeRenameDialog}
            onChangePortValue={this._onChangePortValue}
            onRevertPortValue={this._onRevertPortValue}
            onTriggerButton={this._onTriggerButton}
            editorSplitterWidth={editorSplitterWidth}
          />
        </div>
        {/* <Splitter
          direction="vertical"
          size={mainSplitterWidth}
          onChange={(width) => this.setState({ mainSplitterWidth: width })}
        />
        <Viewer fullscreen={false} onToggleFullscreen={this._onToggleFullscreen} /> */}
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
      </div>
    );
  }
}
