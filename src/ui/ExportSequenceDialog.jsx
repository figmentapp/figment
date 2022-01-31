import React, { Component } from 'react';
import { padWithZeroes } from '../util';

const FILE_EXTENSION_MAP = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
};

export default class ExportSequenceDialog extends Component {
  constructor(props) {
    super(props);
    let defaultNode = props.network.nodes.find((n) => n.type === 'core.out');
    if (!defaultNode) {
      defaultNode = props.network.nodes[0];
    }
    this.state = {
      exportedNodeId: defaultNode.id,
      exportedNode: null,
      frameCount: 100,
      frameRate: 60,
      currentFrame: 0,
      directory: '',
      filePrefix: 'image',
      imageFormat: 'image/png',
      imageQuality: 1.0,
      isExporting: false,
    };
    this._onExport = this._onExport.bind(this);
    this._onSelectDirectory = this._onSelectDirectory.bind(this);
    this._exportFrame = this._exportFrame.bind(this);
  }

  _onExport() {
    const exportedNode = this.props.network.nodes.find((n) => n.id === this.state.exportedNodeId);
    if (!exportedNode) {
      console.error(`Could not find node with id ${this.state.exportedNodeId}`);
      console.error(this.props.network.nodes);
      return;
    }
    this.setState({ isExporting: true, currentFrame: 1, exportedNode });
    this.props.network.reset();
    this._startTime = Date.now();
    window.requestAnimationFrame(this._exportFrame);
  }

  _exportFrame() {
    const fileExt = FILE_EXTENSION_MAP[this.state.imageFormat];
    const imageQuality = this.state.imageFormat === 'image/png' ? 1.0 : this.state.imageQuality;
    const filePath = nodePath.join(
      this.state.directory,
      `${this.state.filePrefix}-${padWithZeroes(this.state.currentFrame)}.${fileExt}`
    );
    this.props.exportImage(this.state.exportedNode, filePath, this.state.imageFormat, imageQuality);
    this.setState({ currentFrame: this.state.currentFrame + 1 });
    if (this.state.currentFrame <= this.state.frameCount) {
      window.setTimeout(this._exportFrame, 1000 / this.state.frameRate);
    } else {
      window.setTimeout(() => {
        this.setState({ isExporting: false });
      }, 1000);
    }
  }

  async _onSelectDirectory() {
    const filePath = await window.desktop.showOpenDirectoryDialog();
    if (!filePath) return;
    this.setState({ directory: filePath });
  }

  render() {
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
              <span className="text-right w-40 mr-2 text-gray-400 px-4">Node</span>
              <select
                value={this.state.exportedNodeId}
                className="bg-gray-800 text-gray-400 p-2 outline-none w-64"
                onChange={(e) => this.setState({ exportedNodeId: parseInt(e.target.value) })}
              >
                {this.props.network.nodes.map((node) => (
                  <option key={node.id} value={node.id}>
                    {node.name}
                  </option>
                ))}
              </select>
            </div>

            <hr className="border-gray-800 my-6" />

            {/* Time range */}
            <div className="flex flex-row items-center mb-6">
              <span className="text-right w-40 mr-2 text-gray-400 px-4">Frames</span>
              <input
                className="bg-gray-800 text-gray-300 p-2 w-24"
                type="number"
                value={this.state.frameCount}
                onChange={(e) => this.setState({ frameCount: parseInt(e.target.value) })}
              />
            </div>
            <div className="flex flex-row items-center">
              <span className="text-right w-40 mr-2 text-gray-400 px-4 truncate">Frame rate</span>
              <input
                className="bg-gray-800 text-gray-300 p-2 w-24"
                type="number"
                value={this.state.frameRate}
                onChange={(e) => this.setState({ frameRate: parseInt(e.target.value) })}
              />
            </div>

            <hr className="border-gray-800 my-6" />

            {/* Folder picker */}
            <div className="flex flex-row items-center mb-4">
              <span className="text-right w-40 mr-2 text-gray-400 px-4">Folder</span>
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
              <span className="text-right w-40 mr-2 text-gray-400 px-4">Prefix</span>
              <div className="flex items-center">
                <input
                  className="h-10 p-2 w-64 text-gray-400 truncate bg-gray-900 border border-gray-800"
                  value={this.state.filePrefix}
                  onChange={(e) => this.setState({ filePrefix: e.target.value })}
                />
              </div>
            </div>

            <hr className="border-gray-800 my-6" />

            {/* Image Format */}
            <div className="flex flex-row items-center">
              <span className="text-right w-40 mr-2 text-gray-400 px-4">Image Format</span>
              <select
                value={this.state.imageFormat}
                className="bg-gray-800 text-gray-400 p-2 outline-none w-64"
                onChange={(e) => this.setState({ imageFormat: e.target.value })}
              >
                <option value="image/png">PNG</option>
                <option value="image/jpeg">JPEG</option>
              </select>
              {this.state.imageFormat === 'image/jpeg' && (
                <div className="flex flex-row items-center">
                  <span className="text-right w-40 mr-2 text-gray-400 px-4">Image Quality</span>
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.1"
                    value={this.state.imageQuality}
                    onChange={(e) => this.setState({ imageQuality: parseFloat(e.target.value) })}
                  />
                  <span className="ml-4 text-sm text-gray-400">{Math.round(this.state.imageQuality * 100)} </span>
                </div>
              )}
            </div>

            <hr className="border-gray-800 my-6" />

            {/* Bottom row */}
            <div className="flex-1"></div>
            <div className="self-end flex flex-row-reverse justify-between items-center px-6 pb-6">
              {!this.state.isExporting && (
                <button
                  disabled={exportDisabled}
                  className={`w-32 ml-2 bg-gray-800 text-gray-300 p-2 focus:outline-none ${
                    exportDisabled ? 'opacity-30' : ''
                  }`}
                  onClick={this._onExport}
                >
                  Export
                </button>
              )}
              {this.state.isExporting && this.state.currentFrame < this.state.frameCount && (
                <span className="text-gray-300 p-2">
                  Exporting [{this.state.currentFrame} / {this.state.frameCount}]…
                </span>
              )}
              {this.state.isExporting && this.state.currentFrame >= this.state.frameCount && (
                <span className="text-gray-300 p-2">Exporting done.</span>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }
}
