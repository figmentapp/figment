import { h, Component } from 'preact';

export default class ForkDialog extends Component {
  constructor(props) {
    super(props);
    this.state = { newTypeName: props.nodeType.type };
    this._onKeyDown = this._onKeyDown.bind(this);
  }

  _onSearch(e) {
    const q = e.target.value;
    const results = this.library.nodeTypes.filter(node =>
      node.name.toLowerCase().includes(q.toLowerCase())
    );
    this.setState({ q, results });
  }

  _onCreateNode(nodeType) {
    this.props.onCreateNode(nodeType);
  }

  componentDidMount() {
    window.addEventListener('keydown', this._onKeyDown);
    document.getElementById('fork-dialog-input').select();
    this.setState({
      currentNodes: this.props.network.nodes.filter(node => node.type === this.props.nodeType.type)
    });
  }

  componentWillUnmount() {
    window.removeEventListener('keydown', this._onKeyDown);
  }

  _onKeyDown(e) {
    if (e.keyCode === 27) {
      this.props.onCancel();
    } else if (e.keyCode === 13) {
      this.props.onForkNodeType(this.props.nodeType, this.state.newTypeName);
    }
  }

  render({ nodeType, network }, { newTypeName, currentNodes }) {
    return (
      <div class="dialog-wrapper">
        <div class="dialog node-dialog shadow-xl w-1/2 flex flex-col" style="height: 40vh">
          <div class="flex">
            <input
              id="fork-dialog-input"
              type="text"
              class="bg-gray-500 flex-grow p-6 placeholder-gray-700 outline-none text-lg"
              value={newTypeName}
              onInput={e => this.setState({ newTypeName: e.target.value })}
              autofocus
            ></input>
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
                  <input type="checkbox" /> {node.name}
                </label>
              ))}
          </div>
        </div>
      </div>
    );
  }
}
