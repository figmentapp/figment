import { h, Component } from 'preact';
import chroma from 'chroma-js';
import { Point } from '../g';
import {
  PORT_TYPE_TRIGGER,
  PORT_TYPE_BUTTON,
  PORT_TYPE_NUMBER,
  PORT_TYPE_POINT,
  PORT_TYPE_COLOR
} from '../model/Port';

class NumberDrag extends Component {
  constructor(props) {
    super(props);
    this._onMouseDown = this._onMouseDown.bind(this);
    this._onMouseMove = this._onMouseMove.bind(this);
    this._onMouseUp = this._onMouseUp.bind(this);
  }

  _onMouseDown(e) {
    e.target.requestPointerLock();
    e.preventDefault();
    window.addEventListener('mousemove', this._onMouseMove);
    window.addEventListener('mouseup', this._onMouseUp);
  }

  _onMouseMove(e) {
    e.preventDefault();
    if (this.props.direction === 'xy') {
      const value = this.props.value;
      this.props.onChange(new Point(value.x + e.movementX, value.y + e.movementY));
    } else {
      this.props.onChange(this.props.value + e.movementX);
    }
  }

  _onMouseUp(e) {
    e.preventDefault();
    window.removeEventListener('mousemove', this._onMouseMove);
    window.removeEventListener('mouseup', this._onMouseUp);
    document.exitPointerLock();
  }

  render({ label, direction }) {
    return (
      <span
        class={`w-32 text-right text-gray-500 mr-4 ${
          direction === 'xy' ? 'cursor-move' : 'cursor-col-resize'
        }`}
        onMouseDown={this._onMouseDown}
      >
        {label}
      </span>
    );
  }
}

class FloatParam extends Component {
  constructor(props) {
    super(props);
    this._onChange = this._onChange.bind(this);
  }

  _onChange(e) {
    const value = parseInt(e.target.value);
    if (isNaN(value)) return;
    this.props.onChange(value);
  }

  render({ label, value, onChange }) {
    return (
      <div class="flex items-center mb-2">
        <NumberDrag label={label} value={value} onChange={onChange} />
        <input
          type="text"
          spellcheck="false"
          class="w-16 mr-4 bg-gray-700 text-gray-200 p-2"
          value={value}
          onChange={this._onChange}
        />
      </div>
    );
  }
}

class ColorParam extends Component {
  constructor(props) {
    super(props);
    this._onChange = this._onChange.bind(this);
  }

  _onChange(e) {
    let value = e.target.value;
    value = chroma(value).rgb();
    this.props.onChange(value);
  }

  render({ label, value }) {
    value = chroma(value).hex();
    return (
      <div class="params__row">
        <label class="w-32 text-right text-gray-500 mr-4">{label}</label>
        <input class="w-16 bg-gray-700" type="color" value={value} onChange={this._onChange} />
      </div>
    );
  }
}

class PointParam extends Component {
  constructor(props) {
    super(props);
    this._onChange = this._onChange.bind(this);
  }

  _onChange(e) {
    // let value = e.target.value;
    // value = chroma(value).rgb();
    // this.props.onChange(value);
  }

  render({ label, value }) {
    return (
      <div class="params__row">
        <NumberDrag label={label} value={value} onChange={this.props.onChange} direction="xy" />
        <input
          class="w-16 mr-2 bg-gray-700 text-gray-200 p-2"
          type="number"
          value={value.x}
          onChange={e => this.props.onChange(new Point(parseFloat(e.target.value), value.y))}
        />
        <input
          class="w-16 mr-4 bg-gray-700 text-gray-200 p-2"
          type="number"
          value={value.y}
          onChange={e => this.props.onChange(new Point(value.x, parseFloat(e.target.value)))}
        />
      </div>
    );
  }
}

export default class ParamsEditor extends Component {
  constructor(props) {
    super(props);
    this._onChangePortValue = this._onChangePortValue.bind(this);
  }

  _onChangePortValue(portName, value) {
    this.props.selection.forEach(node => {
      this.props.onChangePortValue(node, portName, value);
    });
  }

  _onTriggerButton(port) {
    this.props.selection.forEach(node => {
      this.props.onTriggerButton(node, port);
    })
  }

  render({ selection }) {
    if (selection.size === 0) {
      return (
        <div class="params">
          <p class="params__empty">Nothing selected</p>
        </div>
      );
    }
    if (selection.size > 1) {
      return (
        <div class="params">
          <p class="params__empty">Many nodes selected</p>
        </div>
      );
    }
    const node = Array.from(selection)[0];
    return (
      <div class="params">
        <div class=" p-4 bg-gray-700 mb-5 flex justify-between items-baseline">
          <span class="text-gray-200">{node.name}</span>
          <span class="text-gray-500 text-xs ml-3">{node.type}</span>
        </div>
        {node.inPorts.map(port => this._renderPort(node, port))}
      </div>
    );
  }

  _renderPort(node, port) {
    let field;
    if (port.type === PORT_TYPE_TRIGGER) {
      return;
    } else if (port.type === PORT_TYPE_BUTTON) {
      field =  <div class="params__row"><span class="w-32 mr-4"></span><button class="bg-gray-600 text-gray-200 w-16 p-2" onClick={value => this._onTriggerButton(port)}>{port.name}</button></div>
    } else if (port.type === PORT_TYPE_NUMBER) {
      field = (
        <FloatParam
          label={port.name}
          value={port.value}
          onChange={value => this._onChangePortValue(port.name, value)}
        />
      );
    } else if (port.type === PORT_TYPE_POINT) {
      field = (
        <PointParam
          label={port.name}
          value={port.value}
          onChange={value => this._onChangePortValue(port.name, value)}
        />
      );
    } else if (port.type === PORT_TYPE_COLOR) {
      field = (
        <ColorParam
          label={port.name}
          value={port.value}
          onChange={value => this._onChangePortValue(port.name, value)}
        />
      );
    } else {
      field = (
        <div class="params__row">
          <span class="params__label">{port.name}</span>
          <span class="params__field">{port.value}</span>
        </div>
      );
    }
    return field;
    // (
    //   <div class="params__row">
    //   {field}
    //     <div class="params__label">{port.name}</div>
    //     <div class="params__field">{field}</div>
    //   </div>
    // );
  }
}
