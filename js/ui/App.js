import { h, Component } from 'preact';

import Network, { DEFAULT_NETWORK } from '../model/Network';
import Editor from './Editor';
import ParamsEditor from './ParamsEditor';

export default class App extends Component {
  constructor(props) {
    super(props);
    const network = new Network();
    network.parse(DEFAULT_NETWORK);
    this.state = { network, selection: new Set() };
    this._onSelectNode = this._onSelectNode.bind(this);
    this._onClearSelection = this._onClearSelection.bind(this);
    this._onChangeSource = this._onChangeSource.bind(this);
    this._onChangePortValue = this._onChangePortValue.bind(this);
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

  _onChangeSource(node, source) {
    this.state.network.setNodeSource(node, source);
    this.forceUpdate();
  }

  _onChangePortValue(node, portName, value) {
    this.state.network.setPortValue(node, portName, value);
    this.forceUpdate();
  }

  render(_, { network, selection }) {
    return (
      <div class="app">
        <Editor
          network={network}
          selection={selection}
          onSelectNode={this._onSelectNode}
          onClearSelection={this._onClearSelection}
          onChangeSource={this._onChangeSource}
        />
        <div class="viewer" id="viewer" />
        <ParamsEditor
          network={network}
          selection={selection}
          onChangePortValue={this._onChangePortValue}
        />
      </div>
    );
  }
}
