import { h, Component } from 'preact';

export default class ForkDialog extends Component {
  constructor(props) {
    super(props);
    let [ns, baseName] = props.nodeType.type.split('.');
    ns = 'project';
    const currentNodes = props.network.nodes.filter(node => node.type === props.nodeType.type);

    const selectedNodes = new Set();
    for (const node of currentNodes) {
      if (props.selection.has(node)) {
        selectedNodes.add(node);
      }
    }
    this.state = { ns, newBaseName: baseName, currentNodes, selectedNodes };
    this._onKeyDown = this._onKeyDown.bind(this);
  }

  componentDidMount() {
    window.addEventListener('keydown', this._onKeyDown);
    document.getElementById('fork-dialog-input').select();
    // this.setState({
    //   currentNodes: this.props.network.nodes.filter(node => node.type === this.props.nodeType.type)
    // });
  }

  componentWillUnmount() {
    window.removeEventListener('keydown', this._onKeyDown);
  }

  _onKeyDown(e) {
    if (e.keyCode === 27) {
      e.preventDefault();
      this.props.onCancel();
    } else if (e.keyCode === 13) {
      e.preventDefault();
      const newBaseName = this.state.newBaseName.trim();
      if (newBaseName.length === 0) return this.props.onCancel();
      const newTypeName = this.state.ns + '.' + newBaseName;
      this.props.onForkNodeType(
        this.props.nodeType,
        newTypeName,
        Array.from(this.state.selectedNodes)
      );
    }
  }

  _toggleSelectedNode(node) {
    if (this.state.selectedNodes.has(node)) {
      this.state.selectedNodes.delete(node);
    } else {
      this.state.selectedNodes.add(node);
    }
    this.forceUpdate();
  }

  render({ nodeType, network }, { ns, newBaseName, currentNodes, selectedNodes }) {
    return (
      <div class="dialog-wrapper">
        <div class="dialog node-dialog shadow-xl w-1/2 flex flex-col" style="height: 40vh">
          <div class="flex">
            <span class="bg-gray-500 p-6 flex-grow">
              <span class="text-lg">{ns}.</span>
              <input
                id="fork-dialog-input"
                type="text"
                class="bg-gray-500 flex-grow placeholder-gray-700 outline-none text-lg"
                value={newBaseName}
                onInput={e => this.setState({ newBaseName: e.target.value })}
                autofocus
              ></input>
            </span>
            <span
              class="bg-gray-600 text-gray-700 p-6 text-xl flex items-center justify-center font-bold cursor-pointer"
              onClick={() => this.props.onCancel()}
            >
              x
            </span>
          </div>
          <div class="flex-grow bg-gray-700 text-gray-300 w-full h-full px-4">
            {currentNodes &&
              currentNodes.map(node => (
                <label class="block py-2 ">
                  <input
                    type="checkbox"
                    checked={selectedNodes.has(node)}
                    onChange={() => this._toggleSelectedNode(node)}
                  />
                  {node.name}
                </label>
              ))}
          </div>
        </div>
      </div>
    );
  }
}
