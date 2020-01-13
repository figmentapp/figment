import { h, Component } from 'preact';
import Library from '../model/Library';

export default class NodeDialog extends Component {
  constructor(props) {
    super(props);
    this.library = new Library();
    this.state = { q: '', results: this.library.nodeTypes };
    this._onSearch = this._onSearch.bind(this);
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

  render({}, { results }) {
    return (
      <div class="dialog-wrapper">
        <div class="dialog node-dialog shadow-xl w-1/2 h-1/2">
          <div class="flex">
            <input
              type="search"
              class="bg-gray-500 flex-grow p-6 placeholder-gray-700"
              placeholder="Type to search"
              onInput={this._onSearch}
            ></input>
          </div>
          <div class="flex flex-col">{results.map(nodeType => this._renderNodeType(nodeType))}</div>
        </div>
      </div>
    );
  }

  _renderNodeType(nodeType) {
    return (
      <div class="bg-gray-800 p-4 flex" onDblClick={() => this._onCreateNode(nodeType)}>
        <div class="flex-grow">
          <h4 class="text-xl text-gray-200">
            {nodeType.name} <span class="text-sm text-gray-700">{nodeType.type}</span>
          </h4>
          <p class="text-gray-500 text-sm">{nodeType.description}</p>
        </div>
        <div class="ml-5">
          <div class="block rounded-sm bg-gray-700 text-gray-800 text-xl w-8 h-8 flex items-center justify-center font-bold  cursor-pointer">
            <div onClick={() => this._onCreateNode(nodeType)}>+</div>
          </div>
        </div>
      </div>
    );
  }
}
