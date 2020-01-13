import { h, Component } from 'preact';

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

  render({ direction }) {
    if (direction === VERTICAL) {
      return (
        <div
          class="h-full w-2 bg-gray-800 cursor-col-resize"
          onMouseDown={this._onMouseDown}
        />
      );
    } else {
      return (
        <div
          class="v-full h-2 bg-gray-800 cursor-row-resize"
          onMouseDown={this._onMouseDown}
        />
      );
    }
  }
}
