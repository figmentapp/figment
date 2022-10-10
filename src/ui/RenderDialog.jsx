import React, { Component } from 'react';
import { padWithZeroes } from '../util';

const FILE_EXTENSION_MAP = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
};

export default class RenderDialog extends Component {
  constructor(props) {
    super(props);
    this.state = {
      frameCount: 100,
      frameRate: 60,
      currentFrame: 0,
      isRendering: false,
    };
    this._onRender = this._onRender.bind(this);
    this._renderFrame = this._renderFrame.bind(this);
  }

  _onRender() {
    this.setState({ isRendering: true, currentFrame: 1 });
    window.desktop.setRuntimeMode('export');
    this.props.network.reset();
    this._startTime = Date.now();
    window.requestAnimationFrame(this._renderFrame);
  }

  _renderFrame() {
    this.setState({ currentFrame: this.state.currentFrame + 1 });
    if (this.state.currentFrame <= this.state.frameCount) {
      window.setTimeout(this._renderFrame, 1000 / this.state.frameRate);
    } else {
      window.setTimeout(() => {
        window.desktop.setRuntimeMode('live');
        this.setState({ isRendering: false });
      }, 1000);
    }
  }

  render() {
    // Check if there are any "save image" nodes in the network.
    const saveImageNodes = this.props.network.nodes.filter((n) => n.type === 'image.saveImage');
    // Check if they all have a save folder set.
    const saveFolders = saveImageNodes.every((n) => !!n.inPorts.find((p) => p.name === 'folder').value);
    // Only enable rendering if the above conditions are met.
    const renderEnabled = saveImageNodes.length > 0 && saveFolders;

    return (
      <div className="dialog-wrapper">
        <div className="dialog node-dialog shadow-xl w-1/2 flex flex-col bg-gray-900">
          <div className="flex flex-col flex-1">
            {/* Top row */}
            <div className="flex flex-row justify-between items-center bg-gray-800">
              <span className="text-xl text-gray-400 py-4 px-6">Render All</span>
              <span
                className=" text-gray-600 text-2xl p-4 flex items-center justify-center font-bold cursor-pointer"
                onClick={() => this.props.onCancel()}
              >
                &times;
              </span>
            </div>

            {/* Description */}
            <div className="flex flex-row items-center bg-gray-700 mb-6">
              <span className="text-gray-200 text-sm py-4 px-6">Render out all "Save Image" nodes.</span>
            </div>

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
                onChange={(e) => this.setState({ frameRate: parseFloat(e.target.value) })}
              />
            </div>

            <hr className="border-gray-800 my-6" />

            {/* Bottom row */}
            <div className="flex-1"></div>
            <div className="self-end flex flex-row-reverse justify-between items-center px-6 pb-6">
              {saveImageNodes.length === 0 && <span className="text-gray-400">No "Save Image" nodes found.</span>}
              {!saveFolders && <span className="text-gray-400">Not all "Save Image" nodes have a folder set.</span>}
              {!this.state.isRendering && renderEnabled && (
                <button className={`w-32 ml-2 bg-gray-800 text-gray-300 p-2 focus:outline-none`} onClick={this._onRender}>
                  Render
                </button>
              )}
              {this.state.isRendering && this.state.currentFrame < this.state.frameCount && (
                <span className="text-gray-300 p-2">
                  Exporting [{this.state.currentFrame} / {this.state.frameCount}]…
                </span>
              )}
              {this.state.isRendering && this.state.currentFrame >= this.state.frameCount && (
                <span className="text-gray-300 p-2">Render done.</span>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }
}
