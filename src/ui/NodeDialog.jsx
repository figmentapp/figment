import React, { Component } from 'react';
import Library from '../model/Library';

export default class NodeDialog extends Component {
  constructor(props) {
    super(props);
    this.nodeTypes = props.network.allNodeTypes();
    this.state = { q: '', results: this.nodeTypes, selectedIndex: 0 };
    this.currentNodeTypeRef = React.createRef();
    this._onSearch = this._onSearch.bind(this);
    this._onKeyDown = this._onKeyDown.bind(this);
  }

  _onSearch(e) {
    const q = e.target.value;
    const results = this.nodeTypes.filter(
      (node) => node.name.toLowerCase().includes(q.toLowerCase()) || node.description.toLowerCase().includes(q.toLowerCase()),
    );
    this.setState({ q, results, selectedIndex: 0 });
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

  isElementInViewport(el) {
    const rect = el.getBoundingClientRect();
    const parentRect = el.parentElement.getBoundingClientRect();
    return rect.top >= parentRect.top && rect.bottom <= parentRect.bottom;
  }

  _onKeyDown(e) {
    if (e.key === 'Escape') {
      this.props.onCancel();
    } else if (e.key === 'ArrowDown') {
      let newIndex = this.state.selectedIndex + 1;
      if (newIndex >= this.state.results.length) {
        newIndex = 0;
      }
      this.setState({ selectedIndex: newIndex });
      if (this.currentNodeTypeRef.current && !this.isElementInViewport(this.currentNodeTypeRef.current)) {
        this.currentNodeTypeRef.current.scrollIntoView({ behavior: 'auto' });
      }
    } else if (e.key === 'ArrowUp') {
      let newIndex = this.state.selectedIndex - 1;
      if (newIndex < 0) {
        newIndex = this.state.results.length - 1;
      }
      this.setState({ selectedIndex: newIndex });
      if (this.currentNodeTypeRef.current && !this.isElementInViewport(this.currentNodeTypeRef.current)) {
        this.currentNodeTypeRef.current.scrollIntoView({ behavior: 'auto' });
      }
    } else if (e.key === 'Enter') {
      if (this.state.selectedIndex >= 0 && this.state.selectedIndex < this.state.results.length) {
        this.props.onCreateNode(this.state.results[this.state.selectedIndex]);
      }
    }
  }

  render() {
    const { results } = this.state;
    return (
      <div className="dialog-wrapper" onClick={this.props.onCancel}>
        <div
          className="bg-gray-800 dialog node-dialog shadow-xl w-1/2 rounded-lg overflow-hidden flex flex-col border-gray-900 border-2"
          style={{ height: '80vh' }}
          onClick={(e) => e.stopPropagation()}
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
            {results.map((nodeType, index) => this._renderNodeType(nodeType, index))}
          </div>
        </div>
      </div>
    );
  }

  _renderNodeType(nodeType, index) {
    return (
      <div
        ref={(index === this.state.selectedIndex && this.currentNodeTypeRef) || null}
        key={nodeType.type}
        className={`${
          index === this.state.selectedIndex ? 'bg-gray-600' : 'bg-gray-800'
        } p-4 flex items-center border-t border-gray-700 cursor-pointer`}
        onDoubleClick={() => this._onCreateNode(nodeType)}
      >
        <div className="flex-grow">
          <h4 className="text-xl text-gray-200">
            {nodeType.name} <span className="text-sm text-gray-700">{nodeType.type}</span>
          </h4>
          <p className="text-gray-500 text-sm">{nodeType.description}</p>
        </div>
        <div className="ml-5">
          <div className="rounded-sm bg-gray-700 text-gray-400 text-xl w-8 h-8 flex items-center justify-center font-bold cursor-pointer">
            <div onClick={() => this._onCreateNode(nodeType)}>+</div>
          </div>
        </div>
      </div>
    );
  }
}
