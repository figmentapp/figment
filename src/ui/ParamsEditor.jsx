import React, { Component, useRef } from 'react';
import chroma from 'chroma-js';
import ColorPicker from './ColorPicker';
import { Point } from '../g';
import * as figment from '../figment';
// import { remote } from 'electron';
import { throttle, startCase } from 'lodash';

import {
  PORT_TYPE_TRIGGER,
  PORT_TYPE_TOGGLE,
  PORT_TYPE_BUTTON,
  PORT_TYPE_NUMBER,
  PORT_TYPE_STRING,
  PORT_TYPE_SELECT,
  PORT_TYPE_POINT,
  PORT_TYPE_COLOR,
  PORT_TYPE_FILE,
  PORT_TYPE_OBJECT,
} from '../model/Port';

class NumberDrag extends Component {
  constructor(props) {
    super(props);
    this._onMouseDown = this._onMouseDown.bind(this);
    this._onMouseMove = this._onMouseMove.bind(this);
    this._onMouseUp = this._onMouseUp.bind(this);
  }

  _onMouseDown(e) {
    e.preventDefault();
    if (this.props.disabled) return;
    e.target.requestPointerLock();
    window.addEventListener('mousemove', this._onMouseMove);
    window.addEventListener('mouseup', this._onMouseUp);
  }

  _onMouseMove(e) {
    e.preventDefault();
    if (this.props.direction === 'xy') {
      const value = this.props.value;
      this.props.onChange(new Point(value.x + e.movementX * this.props.step, value.y + e.movementY * this.props.step));
    } else {
      let newValue = this.props.value + e.movementX * this.props.step;
      if (this.props.min !== undefined && newValue < this.props.min) newValue = this.props.min;
      if (this.props.max !== undefined && newValue > this.props.max) newValue = this.props.max;
      this.props.onChange(newValue);
    }
  }

  _onMouseUp(e) {
    e.preventDefault();
    window.removeEventListener('mousemove', this._onMouseMove);
    window.removeEventListener('mouseup', this._onMouseUp);
    document.exitPointerLock();
  }

  render() {
    const { label, direction, disabled } = this.props;
    let cursor;
    if (disabled) {
      cursor = 'cursor-default';
    } else {
      cursor = direction === 'xy' ? 'cursor-move' : 'cursor-col-resize';
    }
    return (
      <span
        className={`w-32 text-right mr-4 py-2 ${cursor} ${disabled ? 'text-gray-700' : 'text-gray-500'}`}
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
    let newValue = parseFloat(e.target.value);
    if (isNaN(newValue)) return;
    if (this.props.min !== undefined && newValue < this.props.min) newValue = this.props.min;
    if (this.props.max !== undefined && newValue > this.props.max) newValue = this.props.max;
    this.props.onChange(newValue);
  }

  render() {
    const { label, value, min, max, step, disabled, onChange } = this.props;
    return (
      <div className="flex items-center mb-2">
        <NumberDrag
          label={label}
          value={value}
          min={min}
          max={max}
          step={step}
          disabled={disabled}
          onChange={onChange}
        />
        <input
          type="text"
          spellCheck="false"
          disabled={disabled}
          className={'w-32 mr-4 p-2 ' + (disabled ? 'bg-gray-800 text-gray-700' : 'bg-gray-700 text-gray-200')}
          value={value}
          onChange={this._onChange}
        />
      </div>
    );
  }
}

class StringParam extends Component {
  constructor(props) {
    super(props);
    this._onChange = throttle(this._onChange.bind(this), 200);
  }

  _onChange(e) {
    const value = e.target.value;
    this.props.onChange(value);
  }

  render() {
    const { label, value, disabled, onChange } = this.props;
    return (
      <div className="flex items-center mb-2">
        <label className="w-32 text-right text-gray-500 mr-4">{label}</label>
        <input
          type="text"
          spellCheck="false"
          disabled={disabled}
          className={'w-64 mr-4 p-2 ' + (disabled ? 'bg-gray-800 text-gray-700' : 'bg-gray-700 text-gray-200')}
          value={value}
          onInput={this._onChange}
        />
      </div>
    );
  }
}

class SelectParam extends Component {
  render() {
    const { label, value, options, disabled, onChange } = this.props;
    return (
      <div className="flex items-center mb-2">
        <label className="w-32 text-right text-gray-500 mr-4">{label}</label>
        <select
          type="text"
          spellCheck="false"
          disabled={disabled}
          className={'w-64 mr-4 p-2 ' + (disabled ? 'bg-gray-800 text-gray-700' : 'bg-gray-700 text-gray-200')}
          value={value}
          onChange={(e) => onChange(e.target.value)}
        >
          {options.map((option) => (
            <option value={option}>{option}</option>
          ))}
        </select>
      </div>
    );
  }
}

class ColorParam extends Component {
  constructor(props) {
    super(props);
    this.state = { pickerVisible: false };
    this._onToggleColorPicker = this._onToggleColorPicker.bind(this);
    this.row = useRef();
  }

  componentWillReceiveProps(nextProps) {
    if (this.props.port !== nextProps.port) {
      this.setState({ pickerVisible: false });
    }
  }

  _onToggleColorPicker(e) {
    this.setState({ pickerVisible: !this.state.pickerVisible });
    // let value = e.target.value;
    // value = chroma(value).rgb();
    // this.props.onChange(value);
  }

  render() {
    const { label, value, onChange } = this.props;
    const { pickerVisible } = this.state;
    const rgbaValue = chroma(value).rgba();
    return (
      <div className="flex items-center mb-2" ref={this.row}>
        <label className="w-32 text-right text-gray-500 mr-4 py-2">{label}</label>
        <span
          className="w-16 bg-gray-700 h-8"
          style={`background-color: rgba(${rgbaValue.join(',')})`}
          onClick={this._onToggleColorPicker}
        />
        {pickerVisible && <ColorPicker parent={this.row.current} color={value} onChange={onChange} />}
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

  render() {
    const { label, value } = this.props;
    return (
      <div className="params__row">
        <NumberDrag label={label} value={value} onChange={this.props.onChange} direction="xy" />
        <input
          className="w-16 mr-2 bg-gray-700 text-gray-200 p-2"
          type="number"
          value={value.x}
          onChange={(e) => this.props.onChange(new Point(parseFloat(e.target.value), value.y))}
        />
        <input
          className="w-16 mr-4 bg-gray-700 text-gray-200 p-2"
          type="number"
          value={value.y}
          onChange={(e) => this.props.onChange(new Point(value.x, parseFloat(e.target.value)))}
        />
      </div>
    );
  }
}

class FileParam extends Component {
  constructor(props) {
    super(props);
    this._onSelectFile = this._onSelectFile.bind(this);
  }

  async _onSelectFile() {
    const window = remote.BrowserWindow.getFocusedWindow();
    console.assert(window);
    const result = await remote.dialog.showOpenDialog(window, {
      properties: ['openFile'],
    });
    if (result.canceled || !result.filePaths) return;
    const absoluteFile = result.filePaths[0];
    const file = figment.filePathToRelative(absoluteFile);
    this.props.onChange(file);
  }

  render() {
    const { label, value } = this.props;
    return (
      <div className="params__row">
        <label className="w-32 text-right text-gray-500 mr-4">{label}</label>
        <div className="flex items-center">
          <span className="w-64 text-gray-700 overflow-hidden">{value}</span>
          <button className="w-32 ml-2 bg-gray-800 text-gray-300 p-2 focus:outline-none" onClick={this._onSelectFile}>
            Open…
          </button>
        </div>
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
    this.props.selection.forEach((node) => {
      this.props.onChangePortValue(node, portName, value);
    });
  }

  _onTriggerButton(port) {
    this.props.selection.forEach((node) => {
      this.props.onTriggerButton(node, port);
    });
  }

  render() {
    const { network, selection, onShowNodeRenameDialog } = this.props;
    if (selection.size === 0) {
      return (
        <div className="params">
          <p className="params__empty">Nothing selected</p>
        </div>
      );
    }
    if (selection.size > 1) {
      return (
        <div className="params">
          <p className="params__empty">Many nodes selected</p>
        </div>
      );
    }
    const node = Array.from(selection)[0];
    return (
      <div className="params">
        <div className=" p-4 bg-gray-800 mb-5 flex justify-between items-baseline">
          <span className="text-gray-200 hover:bg-gray-700 px-2 py-1" onClick={() => onShowNodeRenameDialog(node)}>
            {node.name}
          </span>
          <span className="text-gray-500 text-xs ml-3">{node.type}</span>
        </div>
        {node.inPorts.map((port) => this._renderPort(network, node, port))}
      </div>
    );
  }

  _renderPort(network, node, port) {
    let field;
    const label = startCase(port.name);
    if (port.type === PORT_TYPE_TRIGGER) {
      return;
    } else if (port.type === PORT_TYPE_BUTTON) {
      field = (
        <div className="params__row">
          <span className="w-32 mr-4"></span>
          <button
            className="bg-gray-600 text-gray-200 w-32 p-2"
            disabled={network.isConnected(port)}
            onClick={() => this._onTriggerButton(port)}
          >
            {label}
          </button>
        </div>
      );
    } else if (port.type === PORT_TYPE_TOGGLE) {
      field = (
        <div className="params__row">
          <span className="w-32 mr-4"></span>
          <label className="w-64  p-2 flex items-center">
            <input
              type="checkbox"
              disabled={network.isConnected(port)}
              checked={port.value}
              onChange={(e) => this._onChangePortValue(port.name, e.target.checked)}
            />
            <span className="ml-2 text-gray-500">{label}</span>
          </label>
        </div>
      );
    } else if (port.type === PORT_TYPE_NUMBER) {
      field = (
        <FloatParam
          label={label}
          value={port.value}
          min={port.min}
          max={port.max}
          step={port.step}
          disabled={network.isConnected(port)}
          onChange={(value) => this._onChangePortValue(port.name, value)}
        />
      );
    } else if (port.type === PORT_TYPE_STRING) {
      field = (
        <StringParam
          label={label}
          value={port.value}
          disabled={network.isConnected(port)}
          onChange={(value) => this._onChangePortValue(port.name, value)}
        />
      );
    } else if (port.type === PORT_TYPE_SELECT) {
      field = (
        <SelectParam
          label={label}
          value={port.value}
          options={port.options}
          disabled={network.isConnected(port)}
          onChange={(value) => this._onChangePortValue(port.name, value)}
        />
      );
    } else if (port.type === PORT_TYPE_POINT) {
      field = (
        <PointParam
          label={label}
          value={port.value}
          disabled={network.isConnected(port)}
          onChange={(value) => this._onChangePortValue(port.name, value)}
        />
      );
    } else if (port.type === PORT_TYPE_COLOR) {
      field = (
        <ColorParam
          port={port}
          label={label}
          value={port.value}
          disabled={network.isConnected(port)}
          onChange={(value) => this._onChangePortValue(port.name, value)}
        />
      );
    } else if (port.type === PORT_TYPE_FILE) {
      field = (
        <FileParam
          label={label}
          value={port.value}
          disabled={network.isConnected(port)}
          onChange={(value) => this._onChangePortValue(port.name, value)}
        />
      );
    } else if (port.type === PORT_TYPE_OBJECT) {
      field = undefined;
    } else {
      field = (
        <div className="params__row">
          <span className="params__label">{port.name}</span>
          <span className="params__field">{port.value}</span>
        </div>
      );
    }
    return field;
    // (
    //   <div className="params__row">
    //   {field}
    //     <div className="params__label">{port.name}</div>
    //     <div className="params__field">{field}</div>
    //   </div>
    // );
  }
}
