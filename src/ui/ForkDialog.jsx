import React, { Component } from 'react';
import { camelCase, startCase } from 'lodash';

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
    this.state = {
      ns,
      newName: props.nodeType.name,
      newTypeName: baseName,
      currentNodes,
      selectedNodes,
      typeNameChanged: false
    };
    this._onKeyDown = this._onKeyDown.bind(this);
    this._onChangeName = this._onChangeName.bind(this);
    this._onFork = this._onFork.bind(this);
  }

  componentDidMount() {
    window.addEventListener('keydown', this._onKeyDown);
    document.getElementById('fork-dialog-input').select();
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
      this._onFork();
    }
  }

  _onFork() {
    const newTypeName = this.state.newTypeName.trim();
    if (newTypeName.length === 0) return this.props.onCancel();
    const newName = this.state.newName.trim();
    if (newName.length === 0) return this.props.onCancel();
    const fullTypeName = this.state.ns + '.' + newTypeName;
    this.props.onForkNodeType(this.props.nodeType, newName, fullTypeName, Array.from(this.state.selectedNodes));
  }

  _toggleSelectedNode(node) {
    if (this.state.selectedNodes.has(node)) {
      this.state.selectedNodes.delete(node);
    } else {
      this.state.selectedNodes.add(node);
    }
    this.forceUpdate();
  }

  _onChangeName(s) {
    let newName = startCase(s);
    if (s.endsWith(' ')) newName += ' ';
    if (this.state.typeNameChanged) {
      // If the user has changed the type name, don't automatically update it.
      this.setState({ newName });
    } else {
      // User has not changed the type name, so change it as well.
      const newTypeName = camelCase(newName);
      this.setState({ newName, newTypeName });
    }
  }

  _onChangeTypeName(s) {
    const newTypeName = camelCase(s);
    const proposedTypeName = camelCase(this.state.newName);
    this.setState({ typeNameChanged: newTypeName !== proposedTypeName, newTypeName });
  }

  render({ nodeType, network }, { ns, newName, newTypeName, currentNodes, selectedNodes }) {
    return (
      <div className="dialog-wrapper">
        <div className="dialog node-dialog shadow-xl w-1/2 flex flex-col border-gray-900 border-2" style="height: 40vh">
          <div className="flex">
            <input
              id="fork-dialog-input"
              type="text"
              className="p-6 bg-gray-500 flex-grow placeholder-gray-700 outline-none text-lg"
              value={newName}
              onInput={e => this._onChangeName(e.target.value)}
              autofocus
            ></input>
            <div className="flex">
              <span
                className="bg-gray-600 text-gray-100 px-8 py-6 text-xl flex items-center justify-center font-bold cursor-pointer uppercase"
                onClick={this._onFork}
              >
                Fork
              </span>
              <span
                className="bg-gray-900 text-gray-600 p-6 text-2xl flex items-center justify-center font-bold cursor-pointer"
                onClick={this.props.onCancel}
              >
                &times;
              </span>
            </div>
          </div>
          <div className="flex">
            <span className="bg-gray-600 p-6 flex-grow">
              <span className="text-lg">{ns}.</span>

              <input
                type="text"
                className="bg-gray-600 flex-grow placeholder-gray-700 outline-none text-lg"
                value={newTypeName}
                onInput={e => this._onChangeTypeName(e.target.value)}
              />
            </span>
          </div>
          <div className="flex-grow bg-gray-700 text-gray-300 w-full h-full px-4 py-5">
            <p className="text-gray-500 mb-5">
              These nodes are currently using the original code. Select them to link them to your forked code.
            </p>
            <div className="overflow-auto">
              {currentNodes &&
                currentNodes.map(node => (
                  <label className="block py-2 pr-2">
                    <input
                      type="checkbox"
                      checked={selectedNodes.has(node)}
                      onChange={() => this._toggleSelectedNode(node)}
                    />
                    <span className="ml-2 text-small">{node.name}</span>
                  </label>
                ))}
            </div>
          </div>
        </div>
      </div>
    );
  }
}
