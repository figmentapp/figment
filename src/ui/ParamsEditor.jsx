import React, { useState, useRef, useEffect } from 'react';
import chroma from 'chroma-js';
import InlineEditor from './InlineEditor';
import { ChromePicker } from 'react-color';
import { Point } from '../g';
import Icon from './Icon';
import * as figment from '../figment';
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
const roundToMaxPlaces = (v, places = 4) => {
  return (Math.round(v * Math.pow(10, places)) / Math.pow(10, places)).toString();
};

const Spacer = () => <div className="flex-1" />;

const NumberDrag = ({ label, value, onChange, min, max, step, direction, disabled }) => {
  const [inputState, setInputState] = useState(NUMBER_DRAG_IDLE);
  const [tempValue, setTempValue] = useState('');
  const inputRef = useRef(null);

  useEffect(() => {
    if (inputState === NUMBER_DRAG_INPUT) {
      inputRef.current.select();
    }
  }, [inputState]);

  const onMouseDown = (e) => {
    e.preventDefault();
    if (disabled) return;
    e.target.requestPointerLock();
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  };

  const onMouseMove = (e) => {
    e.preventDefault();
    let dx = Math.abs(e.movementX);
    let dy = Math.abs(e.movementY);
    const totalDistance = dx + dy;
    if (totalDistance <= 2) return;
    setInputState(NUMBER_DRAG_DRAGGING);
    if (direction === 'xy') {
      const newValue = new Point(value.x + e.movementX * step, value.y + e.movementY * step);
      onChange(newValue);
    } else {
      let newValue = value + e.movementX * step;
      if (min !== undefined && newValue < min) newValue = min;
      if (max !== undefined && newValue > max) newValue = max;
      onChange(newValue);
    }
  };

  const onMouseUp = (e) => {
    e.preventDefault();
    window.removeEventListener('mousemove', onMouseMove);
    window.removeEventListener('mouseup', onMouseUp);
    document.exitPointerLock();
    if (inputState === NUMBER_DRAG_IDLE) {
      setInputState(NUMBER_DRAG_INPUT);
      setTempValue(roundToMaxPlaces(value));
    } else {
      setInputState(NUMBER_DRAG_IDLE);
    }
  };

  const onInputKey = (e) => {
    if (e.keyCode === 13) {
      e.preventDefault();
      onInputEnd();
    } else if (e.keyCode === 27) {
      e.preventDefault();
      setInputState(NUMBER_DRAG_IDLE);
    }
  };

  const onInputEnd = () => {
    let newValue = parseFloat(tempValue);
    if (isNaN(newValue)) return;
    if (min !== undefined && newValue < min) newValue = min;
    if (max !== undefined && newValue > max) newValue = max;
    onChange(newValue);
    setInputState(NUMBER_DRAG_IDLE);
  };

  let cursor;
  if (disabled) {
    cursor = 'cursor-default';
  } else {
    cursor = direction === 'xy' ? 'cursor-move' : 'cursor-col-resize';
  }
  if (inputState !== NUMBER_DRAG_INPUT) {
    return (
      <span
        className={`flex-1 py-2 px-1 whitespace-nowrap border border-transparent bg-gray-800 ${cursor} ${
          disabled ? 'text-gray-700' : 'text-gray-400'
        }`}
        onMouseDown={onMouseDown}
      >
        {roundToMaxPlaces(value)}
      </span>
    );
  } else {
    return (
      <input
        ref={inputRef}
        className="flex-1 bg-transparent bg-gray-800 border border-gray-700 outline-none py-2 px-1 whitespace-nowrap text-gray-100"
        type="text"
        autoFocus={true}
        value={tempValue}
        onChange={(e) => setTempValue(e.target.value)}
        onKeyDown={onInputKey}
        onBlur={onInputEnd}
      />
    );
  }
};

const FloatParam = ({ port, label, value, min, max, step, disabled, onChange }) => {
  const onShowMenu = (e) => {
    e.preventDefault();
    e.stopPropagation();
    window.desktop.showPortContextMenu(port);
  };

  return (
    <>
      <label className="text-right text-gray-500 whitespace-nowrap">{label}</label>
      <NumberDrag label={label} value={value} min={min} max={max} step={step} disabled={disabled} onChange={onChange} />
      <Icon className="params__more" name="dots-vertical-rounded" fill="white" size="16" onClick={onShowMenu} />
    </>
  );
};

const ToggleParam = ({ port, disabled, onChange }) => {
  const handleShowMenu = (e) => {
    e.preventDefault();
    e.stopPropagation();
    window.desktop.showPortContextMenu(port);
  };

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
};

const ExpressionParam = ({ port, label, expression, onChange }) => {
  const handleShowMenu = (e) => {
    e.preventDefault();
    e.stopPropagation();
    window.desktop.showPortContextMenu(port);
  };

  return (
    <>
      <label className="w-32 text-right text-gray-500 mr-4 whitespace-nowrap">{label}</label>
      <InlineEditor value={expression} onChange={onChange} color={port.error ? 'red' : 'green'} tooltip={port.error} />
      <Icon className="params__more" name="dots-vertical-rounded" fill="white" size="16" onClick={handleShowMenu} />
    </>
  );
};

const StringParam = ({ port, label, value, disabled, onChange }) => {
  const onShowMenu = (e) => {
    e.preventDefault();
    e.stopPropagation();
    window.desktop.showPortContextMenu(port);
  };

  return (
    <>
      <label className="text-right text-gray-500 whitespace-nowrap">{label}</label>
      <InlineEditor value={value} onChange={onChange} />
      <Icon className="params__more" name="dots-vertical-rounded" fill="white" size="16" onClick={onShowMenu} />
    </>
  );
};

const SelectParam = ({ port, label, value, options, disabled, onChange }) => {
  const onShowMenu = (e) => {
    e.preventDefault();
    e.stopPropagation();
    window.desktop.showPortContextMenu(port);
  };

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
      <Icon className="params__more" name="dots-vertical-rounded" fill="white" size="16" onClick={onShowMenu} />
    </>
  );
};

const ColorParam = ({ port, label, value, onChange, editorSplitterWidth }) => {
  const [pickerVisible, setPickerVisible] = useState(false);
  const onToggleColorPicker = () => {
    setPickerVisible(!pickerVisible);
  };

  const onShowMenu = (e) => {
    e.preventDefault();
    e.stopPropagation();
    window.desktop.showPortContextMenu(port);
  };

  const rgbaValue = chroma(value).rgba();
  const [r, g, b, a] = value;
  const pickerValue = { r, g, b, a };
  const popover = {
    position: 'absolute',
    zIndex: '2',
    top: '10px',
    right: `${editorSplitterWidth + 2}px`,
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
        onClick={onToggleColorPicker}
      />
      <Icon className="params__more" name="dots-vertical-rounded" fill="white" size="16" onClick={onShowMenu} />
      {pickerVisible && (
        <div style={popover}>
          <div style={cover} onClick={onToggleColorPicker} />
          <ChromePicker color={pickerValue} onChange={(color) => onChange([color.rgb.r, color.rgb.g, color.rgb.b, color.rgb.a])} />
        </div>
      )}
    </>
  );
};

const PointParam = ({ port, label, value, onChange }) => {
  const onShowMenu = (e) => {
    e.preventDefault();
    e.stopPropagation();
    window.desktop.showPortContextMenu(port);
  };

  return (
    <>
      <label className="text-right text-gray-500 py-2 whitespace-nowrap">{label}</label>
      <span className="flex gap-2">
        <NumberDrag label={label} value={value.x} step={0.1} onChange={(v) => onChange(new Point(v, value.y))} />
        <NumberDrag label={label} value={value.y} step={0.1} onChange={(v) => onChange(new Point(value.x, v))} />
      </span>
      <Icon className="params__more" name="dots-vertical-rounded" fill="white" size="16" onClick={onShowMenu} />
    </>
  );
};

const FileParam = ({ port, label, value, fileType, onChange }) => {
  const onSelectFile = async () => {
    const filePath = await window.desktop.showOpenFileDialog(fileType);
    if (!filePath) return;
    const file = figment.filePathToRelative(filePath);
    onChange(file);
  };

  return (
    <>
      <label className="text-right text-gray-500 whitespace-nowrap">{label}</label>
      <div className="flex items-center overflow-hidden">
        <span className="flex-1 text-gray-400 truncate whitespace-nowrap" onClick={onSelectFile} title={value}>
          {value}
        </span>
        <button className="w-32 ml-2 bg-gray-800 text-gray-300 p-2 focus:outline-none" onClick={onSelectFile}>
          Open…
        </button>
      </div>
      <span />
    </>
  );
};

const DirectoryParam = ({ port, label, value, onChange }) => {
  const onSelectDirectory = async () => {
    const filePath = await window.desktop.showOpenDirectoryDialog();
    if (!filePath) return;
    const directory = figment.filePathToRelative(filePath);
    onChange(directory);
  };

  return (
    <>
      <label className="w-32 text-right text-gray-500 mr-4 whitespace-nowrap">{label}</label>
      <div className="flex items-center overflow-hidden">
        <span className="w-32 text-gray-400 truncate" onClick={onSelectDirectory} title={value}>
          {value}
        </span>
        <button className="w-32 ml-2 bg-gray-800 text-gray-300 p-2 focus:outline-none" onClick={onSelectDirectory}>
          Open…
        </button>
      </div>
      <span />
    </>
  );
};

const ParamsEditor = ({ network, selection, onChangePortValue, onChangePortExpression, onTriggerButton, onShowNodeRenameDialog, editorSplitterWidth }) => {
  const onChangePortValueHandler = (portName, value) => {
    selection.forEach((node) => {
      onChangePortValue(node, portName, value);
    });
  };

  const onChangePortExpressionHandler = (portName, expression) => {
    selection.forEach((node) => {
      onChangePortExpression(node, portName, expression);
    });
  };

  const onTriggerButtonHandler = (port) => {
    selection.forEach((node) => {
      onTriggerButton(node, port);
    });
  };

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
      <div className="params__grid grid ">
        {node.inPorts.map((port) => (
          <React.Fragment key={port.name}>
            {port._value.type === 'expression' ? (
              <ExpressionParam
                port={port}
                label={port.label}
                expression={port._value.expression}
                onChange={(expr) => onChangePortExpressionHandler(port.name, expr)}
              />
            ) : port.type === PORT_TYPE_TRIGGER ? null : port.type === PORT_TYPE_BUTTON ? (
              <React.Fragment>
                <span className="w-32 mr-4"></span>
                <button
                  className="bg-gray-600 text-gray-200 w-32 p-2"
                  onClick={() => onTriggerButtonHandler(port)}
                >
                  {port.label}
                </button>
                <span />
              </React.Fragment>
            ) : port.type === PORT_TYPE_TOGGLE ? (
              <ToggleParam
                port={port}
                label={port.label}
                value={port.value}
                onChange={(value) => onChangePortValueHandler(port.name, value)}
              />
            ) : port.type === PORT_TYPE_NUMBER ? (
              <FloatParam
                port={port}
                label={port.label}
                value={port.value}
                min={port.min}
                max={port.max}
                step={port.step}
                onChange={(value) => onChangePortValueHandler(port.name, value)}
                editorSplitterWidth={editorSplitterWidth}
              />
            ) : port.type === PORT_TYPE_STRING ? (
              <StringParam
                port={port}
                label={port.label}
                value={port.value}
                onChange={(value) => onChangePortValueHandler(port.name, value)}
              />
            ) : port.type === PORT_TYPE_SELECT ? (
              <SelectParam
                port={port}
                label={port.label}
                value={port.value}
                options={port.options}
                onChange={(value) => onChangePortValueHandler(port.name, value)}
              />
            ) : port.type === PORT_TYPE_POINT ? (
              <PointParam
                port={port}
                label={port.label}
                value={port.value}
                onChange={(value) => onChangePortValueHandler(port.name, value)}
              />
            ) : port.type === PORT_TYPE_COLOR ? (
              <ColorParam
                port={port}
                label={port.label}
                value={port.value}
                onChange={(value) => onChangePortValueHandler(port.name, value)}
                editorSplitterWidth={editorSplitterWidth}
              />
            ) : port.type === PORT_TYPE_FILE ? (
              <FileParam
                port={port}
                label={port.label}
                value={port.value}
                fileType={port.fileType}
                onChange={(value) => onChangePortValueHandler(port.name, value)}
              />
            ) : port.type === PORT_TYPE_DIRECTORY ? (
              <DirectoryParam
                port={port}
                label={port.label}
                value={port.value}
                onChange={(value) => onChangePortValueHandler(port.name, value)}
              />
            ) : null}
          </React.Fragment>
        ))}
      </div>
    </div>
  );
};

export default ParamsEditor;
