import { h, Component } from 'preact';
import { useRef } from 'preact/hooks';
import chroma from 'chroma-js';
import ColorPicker from './ColorPicker';
import { Point } from '../g';
import * as figment from '../figment';
import { remote } from 'electron';
import { throttle, startCase } from 'lodash';

// import {
//   PARAM_TYPE_TRIGGER,
//   PARAM_TYPE_TOGGLE,
//   PARAM_TYPE_BUTTON,
//   PARAM_TYPE_NUMBER,
//   PARAM_TYPE_STRING,
//   PARAM_TYPE_SELECT,
//   PARAM_TYPE_POINT,
//   PARAM_TYPE_COLOR,
//   PARAM_TYPE_FILE,
//   PARAM_TYPE_OBJECT
// } from '../model/Port';

import {
  PARAM_TYPE_INT,
  PARAM_TYPE_INT2,
  PARAM_TYPE_FLOAT,
  PARAM_TYPE_FLOAT2,
  PARAM_TYPE_STRING
} from '../model/Param';

function NumberDrag({ value, step = 1, min, max, disabled, onChange }) {
  const onMouseDown = e => {
    e.preventDefault();
    if (this.props.disabled) return;
    e.target.requestPointerLock();
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  };

  const onMouseMove = e => {
    e.preventDefault();
    // if (this.props.direction === 'xy') {
    //   const value = this.props.value;
    //   onChange(
    //     new Point(value.x + e.movementX * this.props.step, value.y + e.movementY * this.props.step)
    //   );
    // } else {
    let newValue = value + e.movementX * step;
    if (min !== undefined && newValue < min) newValue = min;
    if (max !== undefined && newValue > max) newValue = max;
    onChange(newValue);
    // }
  };

  const onMouseUp = e => {
    e.preventDefault();
    window.removeEventListener('mousemove', onMouseMove);
    window.removeEventListener('mouseup', onMouseUp);
    document.exitPointerLock();
  };

  let cursor = disabled ? 'cursor-default' : 'cursor-col-resize';
  return (
    <span
      class={`w-32 text-right mr-4 py-2 ${cursor} ${disabled ? 'text-gray-700' : 'text-gray-500'}`}
      onMouseDown={onMouseDown}
    >
      {label}
    </span>
  );
}

function FloatParam({ label, value, min, max, step, disabled, onChange }) {
  const handleChange = e => {
    let newValue = parseFloat(e.target.value);
    if (isNaN(newValue)) return;
    if (this.props.min !== undefined && newValue < this.props.min) newValue = this.props.min;
    if (this.props.max !== undefined && newValue > this.props.max) newValue = this.props.max;
    this.props.onChange(newValue);
  };

  return (
    <div class="flex items-center mb-2">
      <span class="w-32 text-right mr-4 py-2">{label}</span>
      <NumberDrag value={value} min={min} max={max} step={step} disabled={disabled} onChange={handleChange} />
      {/* <input
        type="text"
        spellcheck="false"
        disabled={disabled}
        class={'w-32 mr-4 p-2 ' + (disabled ? 'bg-gray-800 text-gray-700' : 'bg-gray-700 text-gray-200')}
        value={value}
        onChange={handleChange}
      /> */}
    </div>
  );
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

  render({ label, value, disabled, onChange }) {
    return (
      <div class="flex items-center mb-2">
        <label class="w-32 text-right text-gray-500 mr-4">{label}</label>
        <input
          type="text"
          spellcheck="false"
          disabled={disabled}
          class={'w-64 mr-4 p-2 ' + (disabled ? 'bg-gray-800 text-gray-700' : 'bg-gray-700 text-gray-200')}
          value={value}
          onInput={this._onChange}
        />
      </div>
    );
  }
}

class SelectParam extends Component {
  render({ label, value, options, disabled, onChange }) {
    return (
      <div class="flex items-center mb-2">
        <label class="w-32 text-right text-gray-500 mr-4">{label}</label>
        <select
          type="text"
          spellcheck="false"
          disabled={disabled}
          class={'w-64 mr-4 p-2 ' + (disabled ? 'bg-gray-800 text-gray-700' : 'bg-gray-700 text-gray-200')}
          value={value}
          onChange={e => onChange(e.target.value)}
        >
          {options.map(option => (
            <option value={option}>{option}</option>
          ))}
        </select>
      </div>
    );
  }
}



function ColorParam({ onChange })  {
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

  render({ label, value, onChange }, { pickerVisible }) {
    const rgbaValue = chroma(value).rgba();
    return (
      <div class="flex items-center mb-2" ref={this.row}>
        <label class="w-32 text-right text-gray-500 mr-4 py-2">{label}</label>
        <span
          class="w-16 bg-gray-700 h-8"
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

class FileParam extends Component {
  constructor(props) {
    super(props);
    this._onSelectFile = this._onSelectFile.bind(this);
  }

  async _onSelectFile() {
    const window = remote.BrowserWindow.getFocusedWindow();
    console.assert(window);
    const result = await remote.dialog.showOpenDialog(window, {
      properties: ['openFile']
    });
    if (result.canceled || !result.filePaths) return;
    const absoluteFile = result.filePaths[0];
    const file = figment.filePathToRelative(absoluteFile);
    this.props.onChange(file);
  }

  render({ label, value }) {
    return (
      <div class="params__row">
        <label class="w-32 text-right text-gray-500 mr-4">{label}</label>
        <div class="flex items-center">
          <span class="w-64 text-gray-700 overflow-hidden">{value}</span>
          <button class="w-32 ml-2 bg-gray-800 text-gray-300 p-2 focus:outline-none" onClick={this._onSelectFile}>
            Open…
          </button>
        </div>
      </div>
    );
  }
}

function ParamRow({ network, node, param, onChangeParamValue }) {
  let field;
  const label = startCase(param.name);
  // if (param.type === PARAM_TYPE_BUTTON) {
  //   field = (
  //     <div class="params__row">
  //       <span class="w-32 mr-4"></span>
  //       <button
  //         class="bg-gray-600 text-gray-200 w-32 p-2"
  //         disabled={network.isConnected(param)}
  //         onClick={() => this._onTriggerButton(port)}
  //       >
  //         {label}
  //       </button>
  //     </div>
  //   );
  // if (param.type === PARAM_TYPE_TOGGLE) {
  //   field = (
  //     <div class="params__row">
  //       <span class="w-32 mr-4"></span>
  //       <label class="w-64  p-2 flex items-center">
  //         <input
  //           type="checkbox"
  //           disabled={network.isConnected(param)}
  //           checked={param.value}
  //           onChange={e => onChangeParamValue(param.name, e.target.checked)}
  //         />
  //         <span class="ml-2 text-gray-500">{label}</span>
  //       </label>
  //     </div>
  //   );
  if (param.type === PARAM_TYPE_FLOAT) {
    field = (
      <FloatParam
        label={label}
        value={param.value}
        min={param.min}
        max={param.max}
        step={param.step}
        disabled={network.isConnected(param)}
        onChange={value => onChangeParamValue(param.name, value)}
      />
    );
  } else if (param.type === PARAM_TYPE_FLOAT2) {
    field = (
      <Float2Param
        label={label}
        value={param.value}
        min={param.min}
        max={param.max}
        step={param.step}
        disabled={network.isConnected(param)}
        onChange={value => onChangeParamValue(param.name, value)}
      />
    );
  } else if (param.type === PARAM_TYPE_STRING) {
    field = (
      <StringParam
        label={label}
        value={param.value}
        disabled={network.isConnected(param)}
        onChange={value => onChangeParamValue(param.name, value)}
      />
    );
  } else if (param.type === PARAM_TYPE_SELECT) {
    field = (
      <SelectParam
        label={label}
        value={param.value}
        options={param.options}
        disabled={network.isConnected(param)}
        onChange={value => onChangeParamValue(param.name, value)}
      />
    );
  } else if (param.type === PARAM_TYPE_POINT) {
    field = (
      <PointParam
        label={label}
        value={param.value}
        disabled={network.isConnected(param)}
        onChange={value => onChangeParamValue(param.name, value)}
      />
    );
  } else if (param.type === PARAM_TYPE_COLOR) {
    field = (
      <ColorParam
        port={port}
        label={label}
        value={param.value}
        disabled={network.isConnected(param)}
        onChange={value => onChangeParamValue(param.name, value)}
      />
    );
  } else if (param.type === PARAM_TYPE_FILE) {
    field = (
      <FileParam
        label={label}
        value={param.value}
        disabled={network.isConnected(param)}
        onChange={value => onChangeParamValue(param.name, value)}
      />
    );
  } else if (param.type === PARAM_TYPE_OBJECT) {
    field = undefined;
  } else {
    field = (
      <div class="params__row">
        <span class="params__label">{param.name}</span>
        <span class="params__field">{param.value}</span>
      </div>
    );
  }
  return field;
  // (
  //   <div class="params__row">
  //   {field}
  //     <div class="params__label">{param.name}</div>
  //     <div class="params__field">{field}</div>
  //   </div>
  // );
}

function ParamsEditor({ network, selection, onChangeParamValue, onShowNodeRenameDialog }) {
  // constructor(props) {
  //   super(props);
  //   onChangeParamValue = onChangeParamValue.bind(this);
  // }

  const handleParamChange = (paramName, value) => {
    selection.forEach(node => {
      onChangeParamValue(node, paramName, value);
    });
  };

  // _onTriggerButton(port) {
  //   this.props.selection.forEach(node => {
  //     this.props.onTriggerButton(node, port);
  //   });
  // }

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
      <div class=" p-4 bg-gray-800 mb-5 flex justify-between items-baseline">
        <span class="text-gray-200 hover:bg-gray-700 px-2 py-1" onClick={() => onShowNodeRenameDialog(node)}>
          {node.name}
        </span>
        <span class="text-gray-500 text-xs ml-3">{node.type}</span>
      </div>
      {node.parameters.map(param => (
        <ParamRow network={network} node={node} param={param} onChangeParamValue={handleParamChange} />
      ))}
    </div>
  );
}
