import React, { Component } from 'react';
import Library from '../model/Library';

export default class NodeDialog extends Component {
  constructor(props) {
    super(props);
    this.nodeTypes = props.network.allNodeTypes();
    this.state = { q: '', results: this.nodeTypes };
    this._onSearch = this._onSearch.bind(this);
    this._onKeyDown = this._onKeyDown.bind(this);
  }

  _onSearch(e) {
    const q = e.target.value;
    const results = this.nodeTypes.filter((node) => node.name.toLowerCase().includes(q.toLowerCase()));
    this.setState({ q, results });
  }

  _onCreateNode(nodeType) {
    this.props.onCreateNode(nodeType);
  }

  componentDidMount() {
    window.addEventListener('keydown', this._onKeyDown);
    document.getElementById('node-dialog-search').focus();
  }

  componentWillUnmount() {
    window.removeEventListener('keydown', this._onKeyDown);
  }

  _onKeyDown(e) {
    if (e.keyCode === 27) {
      this.props.onCancel();
    } else if (e.keyCode === 13) {
      if (this.state.results.length > 0) {
        this.props.onCreateNode(this.state.results[0]);
      }
    }
  }

  render() {
    const { results } = this.state;
    return (
      <div className="dialog-wrapper">
        <div
          className="dialog node-dialog shadow-xl w-1/2 overflow-hidden flex flex-col border-gray-900 border-2"
          style={{ height: '80vh' }}
        >
          <div className="flex">
            <input
              id="node-dialog-search"
              type="search"
              className="bg-gray-500 flex-grow p-6 placeholder-gray-700 outline-none text-lg"
              placeholder="Type to search"
              onInput={this._onSearch}
              autoFocus
            ></input>
            <span
              className="bg-gray-900 text-gray-600 p-6 text-2xl flex items-center justify-center font-bold cursor-pointer"
              onClick={() => this.props.onCancel()}
            >
              &times;
            </span>
          </div>
          <div className="flex flex-col h-full overflow-y-auto flex-grow">
            {results.map((nodeType) => this._renderNodeType(nodeType))}
          </div>
        </div>
      </div>
    );
  }

  _renderNodeType(nodeType) {
    return (
      <div
        key={nodeType.name}
        className="bg-gray-800 p-4 flex items-center border-t border-gray-700 cursor-pointer"
        onDoubleClick={() => this._onCreateNode(nodeType)}
      >
        <div className="flex-grow">
          <h4 className="text-xl text-gray-200">
            {nodeType.name} <span className="text-sm text-gray-700">{nodeType.type}</span>
          </h4>
          <p className="text-gray-500 text-sm">{nodeType.description}</p>
        </div>
        <div className="ml-5">
          <div className="block rounded-sm bg-gray-700 text-gray-400 text-xl w-8 h-8 flex items-center justify-center font-bold cursor-pointer">
            <div onClick={() => this._onCreateNode(nodeType)}>+</div>
          </div>
        </div>
      </div>
    );
  }
}
