import { h, Component } from 'preact';
import { remote, ipcRenderer } from 'electron';
import { promises } from 'fs';
const fs = promises;
import Network, { DEFAULT_NETWORK } from '../model/Network';
import { Point } from '../g';
import { PORT_IN, PORT_OUT } from '../model/Port';
import Editor from './Editor';
import ParamsEditor from './ParamsEditor';
import NodeDialog from './NodeDialog';
import Splitter from './Splitter';
import Library from '../model/Library';

const FILE_FILTERS = [{ name: 'Figment Project', extensions: ['fgmt'] }];

function randInt(min, max) {
  return Math.floor(min + Math.random() * (max - min));
}

export default class App extends Component {
  constructor(props) {
    super(props);
    const library = new Library();
    const network = new Network(library);
    network.parse(DEFAULT_NETWORK);
    const lastNetworkPoint = new Point(0, 0);
    this.state = {
      filePath: null,
      dirty: false,
      library,
      network,
      selection: new Set(),
      showNodeDialog: false,
      lastNetworkPoint,
      mainSplitterWidth: 500,
      editorSplitterHeight: (window.innerHeight * 2) / 3
    };
    this.state.selection.add(network.nodes.find(n => n.name === 'Canvas'));
    this._onSelectNode = this._onSelectNode.bind(this);
    this._onClearSelection = this._onClearSelection.bind(this);
    this._onChangeSource = this._onChangeSource.bind(this);
    this._onChangePortValue = this._onChangePortValue.bind(this);
    this._onTriggerButton = this._onTriggerButton.bind(this);
    this._onShowNodeDialog = this._onShowNodeDialog.bind(this);
    this._onHideNodeDialog = this._onHideNodeDialog.bind(this);
    this._onCreateNode = this._onCreateNode.bind(this);
    this._onConnect = this._onConnect.bind(this);
  }

  componentDidMount() {
    this.state.network.start();
    ipcRenderer.on('menu-event', (_, { name }) => this._onMenuEvent(name));
  }

  _onMenuEvent(name) {
    switch (name) {
      case 'open':
        this._onOpenFile();
        break;
      case 'save':
        this._onSaveFile();
        break;
      case 'quit':
        remote.app.quit();
        break;
    }
  }

  async _onOpenFile() {
    const window = remote.BrowserWindow.getFocusedWindow();
    const result = await remote.dialog.showOpenDialog(window, {
      properties: ['openFile'],
      filters: FILE_FILTERS
    });
    if (result.canceled) return;
    this._close();
    const filePath = result.filePaths[0];
    const contents = await fs.readFile(filePath, 'utf-8');
    const json = JSON.parse(contents);
    const network = new Network(this.state.library);
    network.parse(json);
    network.start();
    network.doFrame();
    this.setState({ network, selection: new Set() });
    this._setFilePath(filePath);
  }

  async _onSaveFile() {
    if (!this.state.filePath) return this._onSaveFileAs();
    await this._saveFile(this.state.filePath);
    this.setState({ dirty: false });
  }

  async _onSaveFileAs() {
    const window = remote.BrowserWindow.getFocusedWindow();
    const result = await remote.dialog.showSaveDialog(window, {
      filters: FILE_FILTERS
    });
    if (result.canceled) return;
    const filePath = result.filePath;
    console.log(filePath);
    await this._saveFile(filePath);
    this._setFilePath(filePath);
  }

  async _saveFile(filePath) {
    const json = this.state.network.serialize();
    const contents = JSON.stringify(json, null, 2);
    await fs.writeFile(filePath, contents);
  }

  _close() {
    if (this.state.network) {
      this.state.network.stop();
      document.getElementById('viewer').innerHTML = '';
    }
  }

  _setFilePath(filePath, dirty = false) {
    const window = remote.BrowserWindow.getFocusedWindow();
    window.setRepresentedFilename(filePath);
    window.setDocumentEdited(!dirty);
    this.setState({ filePath, dirty });
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

  _onClearSelection() {
    const { selection } = this.state;
    selection.clear();
    this.forceUpdate();
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

  _onCreateNode(nodeType) {
    console.assert(typeof nodeType === 'object');
    const pt = this.state.lastNetworkPoint;
    const node = this.state.network.createNode(nodeType.type, pt.x, pt.y);
    this.setState({ showNodeDialog: false });
  }

  _onConnect(port1, port2) {
    let inPort, outPort;
    if (port1.direction === PORT_OUT) {
      if (port2.direction !== PORT_IN) return;
      outPort = port1;
      inPort = port2;
    } else {
      if (port2.direction !== PORT_OUT) return;
      inPort = port2;
      outPort = port1;
    }
    this.state.network.connect(outPort.node, outPort, inPort.node, inPort);
  }

  render(
    _,
    { library, network, selection, showNodeDialog, mainSplitterWidth, editorSplitterHeight }
  ) {
    return (
      <div class="app">
        <div class="flex flex-col h-screen" style={`width: ${mainSplitterWidth}px`}>
          <Editor
            style={`height: ${editorSplitterHeight}px`}
            library={library}
            network={network}
            selection={selection}
            onSelectNode={this._onSelectNode}
            onClearSelection={this._onClearSelection}
            onChangeSource={this._onChangeSource}
            onShowNodeDialog={this._onShowNodeDialog}
            onConnect={this._onConnect}
          />
          <Splitter
            direction="horizontal"
            size={editorSplitterHeight}
            onChange={height => this.setState({ editorSplitterHeight: height })}
          />

          <ParamsEditor
            network={network}
            selection={selection}
            onChangePortValue={this._onChangePortValue}
            onTriggerButton={this._onTriggerButton}
          />
        </div>
        <Splitter
          direction="vertical"
          size={mainSplitterWidth}
          onChange={width => this.setState({ mainSplitterWidth: width })}
        />
        <div class="viewer" id="viewer" />

        {showNodeDialog && (
          <NodeDialog onCreateNode={this._onCreateNode} hideNodeDialog={this._onHideNodeDialog} />
        )}
      </div>
    );
  }
}