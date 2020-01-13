import { h, Component } from 'preact';

import Network, { DEFAULT_NETWORK } from '../model/Network';
import { Point } from '../g';
import { PORT_IN, PORT_OUT } from '../model/Port';
import Editor from './Editor';
import ParamsEditor from './ParamsEditor';
import NodeDialog from './NodeDialog';
import Library from '../model/Library';

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
      library,
      network,
      selection: new Set(),
      showNodeDialog: false,
      lastNetworkPoint
    };
    this.state.selection.add(network.nodes.find(n => n.name === 'Canvas'));
    this._onSelectNode = this._onSelectNode.bind(this);
    this._onClearSelection = this._onClearSelection.bind(this);
    this._onChangeSource = this._onChangeSource.bind(this);
    this._onChangePortValue = this._onChangePortValue.bind(this);
    this._onShowNodeDialog = this._onShowNodeDialog.bind(this);
    this._onHideNodeDialog = this._onHideNodeDialog.bind(this);
    this._onCreateNode = this._onCreateNode.bind(this);
    this._onConnect = this._onConnect.bind(this);
  }

  componentDidMount() {
    this.state.network.start();
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

  render(_, { library, network, selection, showNodeDialog }) {
    return (
      <div class="app">
        <div class="flex flex-col h-screen">
          <Editor
            library={library}
            network={network}
            selection={selection}
            onSelectNode={this._onSelectNode}
            onClearSelection={this._onClearSelection}
            onChangeSource={this._onChangeSource}
            onShowNodeDialog={this._onShowNodeDialog}
            onConnect={this._onConnect}
          />
          <ParamsEditor
            network={network}
            selection={selection}
            onChangePortValue={this._onChangePortValue}
          />
        </div>
        <div class="viewer" id="viewer" />

        {showNodeDialog && (
          <NodeDialog onCreateNode={this._onCreateNode} hideNodeDialog={this._onHideNodeDialog} />
        )}
      </div>
    );
  }
}
