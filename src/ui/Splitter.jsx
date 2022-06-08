import React, { Component } from 'react';

const VERTICAL = 'vertical';
const HORIZONTAL = 'horizontal';

function clamp(v, min, max) {
  if (v < min) {
    return min;
  } else if (v > max) {
    return max;
  } else {
    return v;
  }
}

export default class Splitter extends Component {
  constructor(props) {
    super(props);
    this._onMouseDown = this._onMouseDown.bind(this);
    this._onMouseMove = this._onMouseMove.bind(this);
    this._onMouseUp = this._onMouseUp.bind(this);
  }

  _onMouseDown(e) {
    e.preventDefault();
    this._startSize = this.props.size;
    this._startPos = this.props.direction === VERTICAL ? e.clientX : e.clientY;
    window.addEventListener('mousemove', this._onMouseMove);
    window.addEventListener('mouseup', this._onMouseUp);
  }

  _onMouseMove(e) {
    e.preventDefault();
    if (this.props.direction === VERTICAL) {
      let dx = e.clientX - this._startPos;
      let newSize = this._startSize - dx;
      newSize = clamp(newSize, this.props.minSize, Infinity);
      this.props.onChange(newSize);
    } else {
      let dy = e.clientY - this._startPos;
      let newSize = this._startSize - dy;
      newSize = clamp(newSize, this.props.minSize, Infinity);
      this.props.onChange(newSize);
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
