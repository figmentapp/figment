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
import ForkDialog from './ForkDialog';

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
      filePath: undefined,
      dirty: false,
      library,
      network,
      tabs: [],
      activeTabIndex: -1,
      selection: new Set(),
      showNodeDialog: false,
      showForkDialog: false,
      forkDialogNodeType: null,
      lastNetworkPoint,
      mainSplitterWidth: 500,
      editorSplitterHeight: (window.innerHeight * 2) / 3
    };
    this.state.selection.add(network.nodes.find(n => n.name === 'Canvas'));
    this._onNewCodeTab = this._onNewCodeTab.bind(this);
    this._onSelectTab = this._onSelectTab.bind(this);
    this._onCloseTab = this._onCloseTab.bind(this);
    this._onSelectNode = this._onSelectNode.bind(this);
    this._onClearSelection = this._onClearSelection.bind(this);
    this._onDeleteSelection = this._onDeleteSelection.bind(this);
    this._onChangeSource = this._onChangeSource.bind(this);
    this._onChangePortValue = this._onChangePortValue.bind(this);
    this._onTriggerButton = this._onTriggerButton.bind(this);
    this._onShowNodeDialog = this._onShowNodeDialog.bind(this);
    this._onHideNodeDialog = this._onHideNodeDialog.bind(this);
    this._onShowForkDialog = this._onShowForkDialog.bind(this);
    this._onHideForkDialog = this._onHideForkDialog.bind(this);
    this._onForkNodeType = this._onForkNodeType.bind(this);
    this._onCreateNode = this._onCreateNode.bind(this);
    this._onConnect = this._onConnect.bind(this);
    this._onDisconnect = this._onDisconnect.bind(this);
  }

  componentDidMount() {
    this.state.network.start();
    ipcRenderer.on('menu-event', (_, { name, filePath }) => this._onMenuEvent(name, filePath));
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
      case 'quit':
        remote.app.quit();
        break;
    }
  }

  _newProject() {
    this._close();
    const library = new Library();
    const network = new Network(library);
    network.parse(DEFAULT_NETWORK);
    network.start();
    network.doFrame();
    this.setState({ network, selection: new Set() });
    this._setFilePath(undefined);
  }

  async _onOpenFile() {
    const window = remote.BrowserWindow.getFocusedWindow();
    const result = await remote.dialog.showOpenDialog(window, {
      properties: ['openFile'],
      filters: FILE_FILTERS
    });
    if (result.canceled) return;
    await this._openFile(result.filePaths[0]);
  }

  async _openFile(filePath) {
    this._close();
    const contents = await fs.readFile(filePath, 'utf-8');
    const json = JSON.parse(contents);
    const network = new Network(this.state.library);
    network.parse(json);
    network.start();
    network.doFrame();
    this.setState({ network, selection: new Set() });
    this._setFilePath(filePath);
    remote.app.addRecentDocument(filePath);
    ipcRenderer.send('open-project', filePath);
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
    await this._saveFile(filePath);
    this._setFilePath(filePath);
  }

  async _saveFile(filePath) {
    const json = this.state.network.serialize();
    const contents = JSON.stringify(json, null, 2);
    await fs.writeFile(filePath, contents);
    ipcRenderer.send('save-project', filePath);
  }

  _close() {
    if (this.state.network) {
      this.state.network.stop();
      document.getElementById('viewer').innerHTML = '';
    }
    // FIXME: check for unsaved changes
  }

  _setFilePath(filePath, dirty = false) {
    const window = remote.BrowserWindow.getFocusedWindow();
    if (window) {
      // FIXME: how to clear the represented filename?
      filePath && window.setRepresentedFilename(filePath);
      window.setDocumentEdited(!dirty);
    }
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

  _onForkNodeType(nodeType, newTypeName, nodes = []) {
    const { network } = this.state;
    const newNodeType = network.forkNodeType(nodeType, newTypeName);
    for (const node of nodes) {
      network.changeNodeType(node, newNodeType);
    }
    this._onNewCodeTab(newNodeType, state => {
      const tabs = this.state.tabs.filter(t => t.type !== nodeType.type);
      this.setState({
        tabs,
        showForkDialog: false,
        activeTabIndex: tabs.length - 1
      });
    });
  }

  _onCreateNode(nodeType) {
    console.assert(typeof nodeType === 'object');
    const pt = this.state.lastNetworkPoint;
    const node = this.state.network.createNode(nodeType.type, pt.x, pt.y);
    this.setState({ showNodeDialog: false });
  }

  _onConnect(outPort, inPort) {
    this.state.network.connect(outPort, inPort);
  }

  _onDisconnect(inPort) {
    this.state.network.disconnect(inPort);
  }

  render(
    _,
    {
      library,
      network,
      selection,
      tabs,
      activeTabIndex,
      showNodeDialog,
      showForkDialog,
      forkDialogNodeType,
      mainSplitterWidth,
      editorSplitterHeight
    }
  ) {
    return (
      <div class="app">
        <div class="flex flex-col h-screen" style={`width: ${mainSplitterWidth}px`}>
          <Editor
            tabs={tabs}
            activeTabIndex={activeTabIndex}
            style={`height: ${editorSplitterHeight}px`}
            library={library}
            network={network}
            selection={selection}
            onNewCodeTab={this._onNewCodeTab}
            onSelectTab={this._onSelectTab}
            onCloseTab={this._onCloseTab}
            onSelectNode={this._onSelectNode}
            onClearSelection={this._onClearSelection}
            onDeleteSelection={this._onDeleteSelection}
            onChangeSource={this._onChangeSource}
            onShowNodeDialog={this._onShowNodeDialog}
            onShowForkDialog={this._onShowForkDialog}
            onConnect={this._onConnect}
            onDisconnect={this._onDisconnect}
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
          <NodeDialog
            network={network}
            onCreateNode={this._onCreateNode}
            onCancel={this._onHideNodeDialog}
          />
        )}
        {showForkDialog && (
          <ForkDialog
            network={network}
            selection={selection}
            nodeType={forkDialogNodeType}
            onForkNodeType={this._onForkNodeType}
            onCancel={this._onHideForkDialog}
          />
        )}
      </div>
    );
  }
}
