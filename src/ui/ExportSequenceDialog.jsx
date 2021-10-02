import React, { Component } from 'react';

export default class ExportSequenceDialog extends Component {
  constructor(props) {
    super(props);
    this.state = {
      exportedNode: null,
      startFrame: 0,
      endFrame: 100,
      directory: '',
      filePrefix: 'image-',
    };
    // this._onKeyDown = this._onKeyDown.bind(this);
    // this._onChangeName = this._onChangeName.bind(this);
    this._onExport = this._onExport.bind(this);
    this._onSelectDirectory = this._onSelectDirectory.bind(this);
  }

  componentDidMount() {
    // window.addEventListener('keydown', this._onKeyDown);
    // document.getElementById('fork-dialog-input').select();
  }

  componentWillUnmount() {
    // window.removeEventListener('keydown', this._onKeyDown);
  }

  //   _onKeyDown(e) {
  //     if (e.keyCode === 27) {
  //       e.preventDefault();
  //       this.props.onCancel();
  //     } else if (e.keyCode === 13) {
  //       e.preventDefault();
  //       this._onFork();
  //     }
  //   }

  _onExport() {
    // const newTypeName = this.state.newTypeName.trim();
    // if (newTypeName.length === 0) return this.props.onCancel();
    // const newName = this.state.newName.trim();
    // if (newName.length === 0) return this.props.onCancel();
    // const fullTypeName = this.state.ns + '.' + newTypeName;
    this.props.onExportSequence(
      this.state.exportedNode,
      this.state.startFrame,
      this.state.endFrame,
      this.state.directory,
      this.state.filePrefix
    );
  }

  async _onSelectDirectory() {
    const filePath = await window.desktop.showOpenDirectoryDialog();
    if (!filePath) return;
    const directory = figment.filePathToRelative(filePath);
    this.setState({ directory });
    // this.props.onChange(directory);
  }

  render() {
    //const { ns, newName, newTypeName, currentNodes, selectedNodes } = this.state;
    const exportDisabled = this.state.directory.length === 0;

    return (
      <div className="dialog-wrapper">
        <div className="dialog node-dialog shadow-xl w-1/2 flex flex-col bg-gray-900">
          <div className="flex flex-col flex-1">
            {/* Top row */}
            <div className="flex flex-row justify-between items-center bg-gray-800 mb-6">
              <span className="text-xl text-gray-400 py-4 px-6">Export Sequence</span>
              <span
                className=" text-gray-600 text-2xl p-4 flex items-center justify-center font-bold cursor-pointer"
                onClick={() => this.props.onCancel()}
              >
                &times;
              </span>
            </div>

            {/* Node selection */}
            <div className="flex flex-row items-center">
              <span className="text-right w-32 mr-2 text-gray-400 px-4">Node</span>
              <select
                className="bg-gray-800 text-gray-400 p-2 outline-none w-64"
                onChange={(e) => this.setState({ exportedNode: e.target.value })}
              >
                {this.props.network.nodes.map((node) => (
                  <option key={node.id} value={node}>
                    {node.name}
                  </option>
                ))}
              </select>
            </div>

            <hr className="border-gray-800 my-6" />

            {/* Time range */}
            <div className="flex flex-row items-center">
              <span className="text-right w-32 mr-2 text-gray-400 px-4">Range</span>
              <span className="w-16 px-2 text-gray-600 text-right">Start</span>
              <input
                className="bg-gray-800 text-gray-300 p-2 w-24"
                type="number"
                value={this.state.startFrame}
                onChange={(e) => this.setState({ startFrame: parseInt(e.target.value) })}
              />
              <span className="ml-8 w-16 px-2 text-gray-600 text-right">End</span>
              <input
                className="bg-gray-800 text-gray-300 p-2 w-24"
                type="number"
                value={this.state.endFrame}
                onChange={(e) => this.setState({ endFrame: parseInt(e.target.value) })}
              />
            </div>

            <hr className="border-gray-800 my-6" />

            {/* Folder picker */}
            <div className="flex flex-row items-center mb-4">
              <span className="text-right w-32 mr-2 text-gray-400 px-4">Folder</span>
              <div className="flex items-center">
                <span
                  className="h-10 p-2 w-64 text-gray-400 truncate bg-gray-900 border border-gray-800"
                  onClick={this._onSelectDirectory}
                  title={this.state.directory}
                >
                  {this.state.directory}
                </span>
                <button
                  className="h-10 p-2 w-32 bg-gray-800 text-gray-300 focus:outline-none"
                  onClick={this._onSelectDirectory}
                >
                  Open…
                </button>
              </div>
            </div>
            <div className="flex flex-row items-center">
              <span className="text-right w-32 mr-2 text-gray-400 px-4">Prefix</span>
              <div className="flex items-center">
                <input
                  className="h-10 p-2 w-64 text-gray-400 truncate bg-gray-900 border border-gray-800"
                  value={this.state.filePrefix}
                  onChange={(e) => this.setState({ filePrefix: e.target.value })}
                />
              </div>
            </div>

            <hr className="border-gray-800 my-6" />

            {/* Bottom row */}
            <div className="flex-1"></div>
            <div className="self-end flex flex-row-reverse justify-between items-center px-6 pb-6">
              <button
                disabled={exportDisabled}
                className={`w-32 ml-2 bg-gray-800 text-gray-300 p-2 focus:outline-none ${
                  exportDisabled ? 'opacity-30' : ''
                }`}
                onClick={this._onExport}
              >
                Export
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }
}
