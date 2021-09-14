import React, { Component } from 'react';

const VERTICAL = 'vertical';
const HORIZONTAL = 'horizontal';

export default class Splitter extends Component {
  constructor(props) {
    super(props);
    this._onMouseDown = this._onMouseDown.bind(this);
    this._onMouseMove = this._onMouseMove.bind(this);
    this._onMouseUp = this._onMouseUp.bind(this);
  }

  _onMouseDown(e) {
    e.preventDefault();
    window.addEventListener('mousemove', this._onMouseMove);
    window.addEventListener('mouseup', this._onMouseUp);
  }

  _onMouseMove(e) {
    e.preventDefault();
    if (this.props.direction === VERTICAL) {
      this.props.onChange(this.props.size + e.movementX);
    } else {
      this.props.onChange(this.props.size + e.movementY);
    }
  }

  _onMouseUp(e) {
    e.preventDefault();
    window.removeEventListener('mousemove', this._onMouseMove);
    window.removeEventListener('mousemove', this._onMouseUp);
  }

  render() {
    if (this.props.direction === VERTICAL) {
      return <div className="h-full w-1 bg-gray-700 cursor-col-resize" onMouseDown={this._onMouseDown} />;
    } else {
      return <div className="v-full h-1 bg-gray-700 cursor-row-resize" onMouseDown={this._onMouseDown} />;
    }
  }
}
