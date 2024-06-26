import React, { Component, useRef, useEffect, useState, Fragment } from 'react';
import chroma from 'chroma-js';
import InlineEditor from './InlineEditor';
import { ChromePicker } from 'react-color';
import { Point } from '../g';
import Icon from './Icon';
import * as figment from '../figment';
// import { remote } from 'electron';
import { throttle } from 'lodash';

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
  PORT_TYPE_DIRECTORY,
  PORT_TYPE_OBJECT,
} from '../model/Port';

const NUMBER_DRAG_IDLE = 'idle';
const NUMBER_DRAG_DRAGGING = 'drag';
const NUMBER_DRAG_INPUT = 'input';

// Conver the value to a string and round to the correct number of digits.
function roundToMaxPlaces(v, places = 4) {
  return (Math.round(v * Math.pow(10, places)) / Math.pow(10, places)).toString();
  // return +(Math.round(v + 'e+' + places) + 'e-' + places);
}

function Spacer() {
  return <div className="flex-1" />;
}

class NumberDrag extends Component {
  constructor(props) {
    super(props);
    this.state = { inputState: NUMBER_DRAG_IDLE, tempValue: '' };
    this._startX = 0;
    this._startY = 0;
    this._onMouseDown = this._onMouseDown.bind(this);
    this._onMouseMove = this._onMouseMove.bind(this);
    this._onMouseUp = this._onMouseUp.bind(this);
    this._onInputKey = this._onInputKey.bind(this);
    this._onInputEnd = this._onInputEnd.bind(this);
    this.inputRef = React.createRef();
  }

  componentDidUpdate(prevProps) {
    if (prevProps.inputState !== this.props.inputState && this.props.inputState === NUMBER_DRAG_INPUT) {
      this.inputRef.current.select();
    }
  }

  _onMouseDown(e) {
    e.preventDefault();
    if (this.props.disabled) return;
    e.target.requestPointerLock();
    window.addEventListener('mousemove', this._onMouseMove);
    window.addEventListener('mouseup', this._onMouseUp);
    this._dx = 0;
    this._dy = 0;
  }

  _onMouseMove(e) {
    e.preventDefault();
    this._dx += Math.abs(e.movementX);
    this._dy += Math.abs(e.movementY);
    const totalDistance = this._dx + this._dy;
    if (totalDistance <= 2) return;
    this.setState({ inputState: NUMBER_DRAG_DRAGGING });
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
    if (this.state.inputState === NUMBER_DRAG_IDLE) {
      this.setState({ inputState: NUMBER_DRAG_INPUT, tempValue: roundToMaxPlaces(this.props.value) });
      window.requestAnimationFrame(() => {
        this.inputRef.current && this.inputRef.current.select();
      });
    } else {
      this.setState({ inputState: NUMBER_DRAG_IDLE });
    }
  }

  _onInputKey(e) {
    if (e.keyCode === 13) {
      e.preventDefault();
      this._onInputEnd();
    } else if (e.keyCode === 27) {
      e.preventDefault();
      this.setState({ inputState: NUMBER_DRAG_IDLE });
    }
  }

  _onInputEnd() {
    let newValue = parseFloat(this.state.tempValue);
    if (isNaN(newValue)) return;
    if (this.props.min !== undefined && newValue < this.props.min) newValue = this.props.min;
    if (this.props.max !== undefined && newValue > this.props.max) newValue = this.props.max;
    this.props.onChange(newValue);
    this.setState({ inputState: NUMBER_DRAG_IDLE });
  }

  render() {
    const { label, direction, disabled, value } = this.props;
    let cursor;
    if (disabled) {
      cursor = 'cursor-default';
    } else {
      cursor = direction === 'xy' ? 'cursor-move' : 'cursor-col-resize';
    }
    if (this.state.inputState !== NUMBER_DRAG_INPUT) {
      return (
        <span
          className={`flex-1 py-2 px-1 whitespace-nowrap border border-transparent bg-gray-800 ${cursor} ${
            disabled ? 'text-gray-700' : 'text-gray-400'
          }`}
          onMouseDown={this._onMouseDown}
        >
          {roundToMaxPlaces(value)}
        </span>
      );
    } else {
      return (
        <input
          ref={this.inputRef}
          className="flex-1 bg-transparent bg-gray-800 border border-gray-700 outline-none py-2 px-1 whitespace-nowrap text-gray-100"
          type="text"
          autoFocus={true}
          value={this.state.tempValue}
          onChange={(e) => this.setState({ tempValue: e.target.value })}
          onKeyDown={this._onInputKey}
          onBlur={this._onInputEnd}
        />
      );
    }
  }
}

class FloatParam extends Component {
  constructor(props) {
    super(props);
    this.state = { newValue: props.value };
    this._onInput = this._onInput.bind(this);
    this._onChange = this._onChange.bind(this);
    this._onShowMenu = this._onShowMenu.bind(this);
  }

  _onInput(e) {
    this.setState({ newValue: e.target.value });
    if (e.keycode === 13) {
      this._onChange(e);
    }
  }

  _onChange(e) {
    let { newValue } = this.state;
    if (isNaN(newValue)) return;
    if (this.props.min !== undefined && newValue < this.props.min) newValue = this.props.min;
    if (this.props.max !== undefined && newValue > this.props.max) newValue = this.props.max;
    this.props.onChange(newValue);
  }

  _onShowMenu(e) {
    e.preventDefault();
    e.stopPropagation();
    window.desktop.showPortContextMenu(this.props.port);
  }

  render() {
    const { label, value, min, max, step, disabled, onChange } = this.props;
    return (
      <>
        <label className="text-right text-gray-500 whitespace-nowrap">{label}</label>
        <NumberDrag label={label} value={value} min={min} max={max} step={step} disabled={disabled} onChange={onChange} />
        <Icon className="params__more" name="dots-vertical-rounded" fill="white" size="16" onClick={this._onShowMenu} />
      </>
    );
  }
}

function ToggleParam({ port, disabled, onChange }) {
  function handleShowMenu(e) {
    e.preventDefault();
    e.stopPropagation();
    window.desktop.showPortContextMenu(port);
  }

  return (
    <>
      <span className="w-32 mr-4"></span>
      <label className="w-64  p-2 flex items-center">
        <input type="checkbox" disabled={disabled} checked={port.value} onChange={(e) => onChange(e.target.checked)} />
        <span className="ml-2 text-gray-500">{port.label}</span>
      </label>
      <Icon className="params__more" name="dots-vertical-rounded" fill="white" size="16" onClick={handleShowMenu} />
    </>
  );
}

function ExpressionParam({ port, label, expression, onChange }) {
  function handleShowMenu(e) {
    e.preventDefault();
    e.stopPropagation();
    window.desktop.showPortContextMenu(port);
  }

  return (
    <>
      <label className="w-32 text-right text-gray-500 mr-4 whitespace-nowrap">{label}</label>
      <InlineEditor value={expression} onChange={onChange} color={port.error ? 'red' : 'green'} tooltip={port.error} />
      <Icon className="params__more" name="dots-vertical-rounded" fill="white" size="16" onClick={handleShowMenu} />
    </>
  );
}

class StringParam extends Component {
  constructor(props) {
    super(props);
    this._onChange = throttle(this._onChange.bind(this), 200);
    this._onShowMenu = this._onShowMenu.bind(this);
  }

  _onChange(e) {
    const value = e.target.value;
    this.props.onChange(value);
  }

  _onShowMenu(e) {
    e.preventDefault();
    e.stopPropagation();
    window.desktop.showPortContextMenu(this.props.port);
  }

  render() {
    const { label, value, disabled, onChange } = this.props;
    return (
      <>
        <label className="text-right text-gray-500 whitespace-nowrap">{label}</label>
        <InlineEditor value={value} onChange={onChange} />
        <Icon className="params__more" name="dots-vertical-rounded" fill="white" size="16" onClick={this._onShowMenu} />
      </>
    );
  }
}

class SelectParam extends Component {
  constructor(props) {
    super(props);
    this._onShowMenu = this._onShowMenu.bind(this);
  }

  _onShowMenu(e) {
    e.preventDefault();
    e.stopPropagation();
    window.desktop.showPortContextMenu(this.props.port);
  }

  render() {
    const { label, value, options, disabled, onChange } = this.props;
    return (
      <>
        <label className="w-32 text-right text-gray-500 whitespace-nowrap">{label}</label>
        <select
          type="text"
          spellCheck="false"
          disabled={disabled}
          className={'flex-1 p-2 ' + (disabled ? 'bg-gray-800 text-gray-700' : 'bg-gray-700 text-gray-200')}
          value={value}
          onChange={(e) => onChange(e.target.value)}
        >
          {options.map((option, index) =>
            option === '---' ? (
              <option disabled key={index}>
                ───────────────
              </option>
            ) : (
              <option key={option} value={option}>
                {option}
              </option>
            ),
          )}
        </select>
        <Icon className="params__more" name="dots-vertical-rounded" fill="white" size="16" onClick={this._onShowMenu} />
      </>
    );
  }
}

class ColorParam extends Component {
  constructor(props) {
    super(props);
    this.state = { pickerVisible: false };
    this._onToggleColorPicker = this._onToggleColorPicker.bind(this);
    this._onChange = this._onChange.bind(this);
    this._onShowMenu = this._onShowMenu.bind(this);
  }

  componentDidUpdate(nextProps) {
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

  _onChange(color) {
    const { r, g, b, a } = color.rgb;
    this.props.onChange([r, g, b, a]);
  }

  _onShowMenu(e) {
    e.preventDefault();
    e.stopPropagation();
    window.desktop.showPortContextMenu(this.props.port);
  }

  render() {
    const { label, value, onChange } = this.props;
    const { pickerVisible } = this.state;
    const rgbaValue = chroma(value).rgba();
    const [r, g, b, a] = value;
    const pickerValue = { r, g, b, a };
    const popover = {
      position: 'absolute',
      zIndex: '2',
      top: '10px',
      right: `${this.props.editorSplitterWidth + 2}px`,
    };
    const cover = {
      position: 'fixed',
      top: '0px',
      right: '0px',
      bottom: '0px',
      left: '0px',
    };
    return (
      <>
        <label className="text-right text-gray-500 py-2 whitespace-nowrap">{label}</label>
        <span
          className="w-16 bg-gray-700 h-8 border border-gray-800"
          style={{ backgroundColor: `rgba(${rgbaValue.join(',')})` }}
          onClick={this._onToggleColorPicker}
        />
        <Icon className="params__more" name="dots-vertical-rounded" fill="white" size="16" onClick={this._onShowMenu} />
        {pickerVisible && (
          <div style={popover}>
            <div style={cover} onClick={this._onToggleColorPicker} />
            <ChromePicker color={pickerValue} onChange={this._onChange} />
          </div>
        )}
      </>
    );
  }
}

class PointParam extends Component {
  constructor(props) {
    super(props);
    this._onShowMenu = this._onShowMenu.bind(this);
  }

  _onShowMenu(e) {
    e.preventDefault();
    e.stopPropagation();
    window.desktop.showPortContextMenu(this.props.port);
  }

  render() {
    const { label, value } = this.props;
    return (
      <>
        <label className="text-right text-gray-500 py-2 whitespace-nowrap">{label}</label>
        <span className="flex gap-2">
          <NumberDrag label={label} value={value.x} step={0.1} onChange={(v) => this.props.onChange(new Point(v, value.y))} />
          <NumberDrag label={label} value={value.y} step={0.1} onChange={(v) => this.props.onChange(new Point(value.x, v))} />
        </span>
        <Icon className="params__more" name="dots-vertical-rounded" fill="white" size="16" onClick={this._onShowMenu} />
      </>
    );
  }
}

class FileParam extends Component {
  constructor(props) {
    super(props);
    this._onSelectFile = this._onSelectFile.bind(this);
  }

  async _onSelectFile() {
    const filePath = await window.desktop.showOpenFileDialog(this.props.fileType);
    if (!filePath) return;
    const file = figment.filePathToRelative(filePath);
    this.props.onChange(file);
  }

  render() {
    const { label, value } = this.props;
    return (
      <>
        <label className="text-right text-gray-500 whitespace-nowrap">{label}</label>
        <div className="flex items-center overflow-hidden">
          <span className="flex-1 text-gray-400 truncate whitespace-nowrap" onClick={this._onSelectFile} title={value}>
            {value}
          </span>
          <button className="w-32 ml-2 bg-gray-800 text-gray-300 p-2 focus:outline-none" onClick={this._onSelectFile}>
            Open…
          </button>
        </div>
        <span />
      </>
    );
  }
}

class DirectoryParam extends Component {
  constructor(props) {
    super(props);
    this._onSelectDirectory = this._onSelectDirectory.bind(this);
  }

  async _onSelectDirectory() {
    const filePath = await window.desktop.showOpenDirectoryDialog();
    if (!filePath) return;
    const directory = figment.filePathToRelative(filePath);
    this.props.onChange(directory);
  }

  render() {
    const { label, value } = this.props;
    return (
      <>
        <label className="w-32 text-right text-gray-500 mr-4 whitespace-nowrap">{label}</label>
        <div className="flex items-center overflow-hidden">
          <span className="w-32 text-gray-400 truncate" onClick={this._onSelectDirectory} title={value}>
            {value}
          </span>
          <button className="w-32 ml-2 bg-gray-800 text-gray-300 p-2 focus:outline-none" onClick={this._onSelectDirectory}>
            Open…
          </button>
        </div>
        <span />
      </>
    );
  }
}

export default class ParamsEditor extends Component {
  constructor(props) {
    super(props);
    this._onChangePortValue = this._onChangePortValue.bind(this);
    this._onChangePortExpression = this._onChangePortExpression.bind(this);
  }

  _onChangePortValue(portName, value) {
    this.props.selection.forEach((node) => {
      this.props.onChangePortValue(node, portName, value);
    });
  }

  _onChangePortExpression(portName, expression) {
    this.props.selection.forEach((node) => {
      this.props._onChangePortExpression(node, portName, expression);
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
          <div className="params__header"></div>
          <p className="params__empty">Nothing selected</p>
        </div>
      );
    }
    if (selection.size > 1) {
      return (
        <div className="params">
          <div className="params__header"></div>
          <p className="params__empty">Many nodes selected</p>
        </div>
      );
    }
    const node = Array.from(selection)[0];
    return (
      <div className="params">
        <div className="params__header">
          <span className="text-gray-200 hover:bg-gray-700 px-2 py-1" onClick={() => onShowNodeRenameDialog(node)}>
            {node.name}
          </span>
          <span className="text-gray-500 text-xs ml-3">{node.type}</span>
        </div>
        <div className="params__grid grid ">{node.inPorts.map((port) => this._renderPort(network, node, port))}</div>
      </div>
    );
  }

  _renderPort(network, node, port) {
    let field;
    if (port._value.type === 'expression') {
      field = (
        <ExpressionParam
          key={port.name}
          port={port}
          label={port.label}
          expression={port._value.expression}
          disabled={network.isConnected(port)}
          onChange={(expr) => this._onChangePortExpression(port.name, expr)}
        />
      );
    } else if (port.type === PORT_TYPE_TRIGGER) {
      return;
    } else if (port.type === PORT_TYPE_BUTTON) {
      field = (
        <Fragment key={port.name}>
          <span className="w-32 mr-4"></span>
          <button
            className="bg-gray-600 text-gray-200 w-32 p-2"
            disabled={network.isConnected(port)}
            onClick={() => this._onTriggerButton(port)}
          >
            {port.label}
          </button>
          <span />
        </Fragment>
      );
    } else if (port.type === PORT_TYPE_TOGGLE) {
      field = (
        <ToggleParam
          key={port.name}
          port={port}
          label={port.label}
          value={port.value}
          disabled={network.isConnected(port)}
          onChange={(value) => this._onChangePortValue(port.name, value)}
        />
      );
    } else if (port.type === PORT_TYPE_NUMBER) {
      field = (
        <FloatParam
          key={port.name}
          port={port}
          label={port.label}
          value={port.value}
          min={port.min}
          max={port.max}
          step={port.step}
          disabled={network.isConnected(port)}
          onChange={(value) => this._onChangePortValue(port.name, value)}
          onRevert={() => this.props.onRevertPortValue(node, port.name)}
        />
      );
    } else if (port.type === PORT_TYPE_STRING) {
      field = (
        <StringParam
          key={port.name}
          port={port}
          label={port.label}
          value={port.value}
          disabled={network.isConnected(port)}
          onChange={(value) => this._onChangePortValue(port.name, value)}
        />
      );
    } else if (port.type === PORT_TYPE_SELECT) {
      field = (
        <SelectParam
          key={port.name}
          port={port}
          label={port.label}
          value={port.value}
          options={port.options}
          disabled={network.isConnected(port)}
          onChange={(value) => this._onChangePortValue(port.name, value)}
          onRevert={() => this.props.onRevertPortValue(node, port.name)}
        />
      );
    } else if (port.type === PORT_TYPE_POINT) {
      field = (
        <PointParam
          key={port.name}
          port={port}
          label={port.label}
          value={port.value}
          disabled={network.isConnected(port)}
          onChange={(value) => this._onChangePortValue(port.name, value)}
        />
      );
    } else if (port.type === PORT_TYPE_COLOR) {
      field = (
        <ColorParam
          key={port.name}
          port={port}
          label={port.label}
          value={port.value}
          disabled={network.isConnected(port)}
          onChange={(value) => this._onChangePortValue(port.name, value)}
          onRevert={() => this.props.onRevertPortValue(node, port.name)}
          editorSplitterWidth={this.props.editorSplitterWidth}
        />
      );
    } else if (port.type === PORT_TYPE_FILE) {
      field = (
        <FileParam
          key={port.name}
          port={port}
          label={port.label}
          value={port.value}
          fileType={port.fileType}
          disabled={network.isConnected(port)}
          onChange={(value) => this._onChangePortValue(port.name, value)}
        />
      );
    } else if (port.type === PORT_TYPE_DIRECTORY) {
      field = (
        <DirectoryParam
          key={port.name}
          port={port}
          label={port.label}
          value={port.value}
          disabled={network.isConnected(port)}
          onChange={(value) => this._onChangePortValue(port.name, value)}
        />
      );
    } else {
      field = undefined;
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
