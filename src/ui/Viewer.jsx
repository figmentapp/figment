import React, { Component } from 'react';

export default class Viewer extends Component {
  constructor(props) {
    super(props);
  }

  render() {
    const { fullscreen, onToggleFullscreen } = this.props;
    let iconClass = 'fas fa-expand cursor-pointer ';
    iconClass += fullscreen ? 'text-gray-800' : 'text-gray-600';
    return (
      <div className="flex flex-col flex-1">
        <div className="p-5 bg-gray-900 flex justify-end">
          <i className={iconClass} onClick={onToggleFullscreen}></i>
        </div>
        <div className="flex flex-1 justify-center items-center overflow-hidden">
          <div id="viewer"></div>
        </div>
      </div>
    );
  }
}
