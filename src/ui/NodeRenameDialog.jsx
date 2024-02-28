import React, { Component } from 'react';

export default class ForkDialog extends Component {
  constructor(props) {
    super(props);
    this.state = { newName: props.node.name };
    this._onKeyDown = this._onKeyDown.bind(this);
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
      this.props.onRenameNode(this.props.node, this.state.newName);
    }
  }

  render() {
    return (
      <div className="dialog-wrapper">
        <div className="dialog node-dialog shadow-xl w-1/2 flex flex-col border-gray-900 border-2" style={{ height: '40vh' }}>
          <div className="flex">
            <span className="bg-gray-500 p-6 flex-grow">
              <input
                id="fork-dialog-input"
                type="text"
                className="bg-gray-500 flex-grow placeholder-gray-700 outline-none text-lg"
                value={this.state.newName}
                onInput={(e) => this.setState({ newName: e.target.value })}
                autoFocus
              ></input>
            </span>
            <div className="flex">
              <span
                className="bg-gray-600 text-gray-100 px-8 py-6 text-xl flex items-center justify-center font-bold cursor-pointer uppercase"
                onClick={() => this.props.onRenameNode(this.props.node, this.state.newName)}
              >
                Rename
              </span>
              <span
                className="bg-gray-900 text-gray-600 p-6 text-2xl flex items-center justify-center font-bold cursor-pointer"
                onClick={this.props.onCancel}
              >
                &times;
              </span>
            </div>
          </div>
        </div>
      </div>
    );
  }
}
