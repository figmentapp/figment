import React, { useState, useEffect, useRef } from 'react';
import chroma from 'chroma-js';
import InlineEditor from './InlineEditor';
import { ChromePicker } from 'react-color';
import { Point } from '../g';
import Icon from './Icon';
import * as figment from '../figment';
import { throttle } from 'lodash';
import { useAppStore } from './store';

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

// Convert the value to a string and round to the correct number of digits.
function roundToMaxPlaces(v, places = 4) {
  return (Math.round(v * Math.pow(10, places)) / Math.pow(10, places)).toString();
}

function NumberDrag({ label, value, min, max, step, disabled, direction, onChange }) {
  const [inputState, setInputState] = useState(NUMBER_DRAG_IDLE);
  const [tempValue, setTempValue] = useState('');
  const inputRef = useRef(null);
  const dxRef = useRef(0);
  const dyRef = useRef(0);
  const startValueRef = useRef(null);
  const inputStateRef = useRef(NUMBER_DRAG_IDLE);

  useEffect(() => {
    inputStateRef.current = inputState;
    if (inputState === NUMBER_DRAG_INPUT && inputRef.current) {
      inputRef.current.select();
    }
  }, [inputState]);

  const onMouseMove = useRef((e) => {
    e.preventDefault();
    dxRef.current += e.movementX;
    dyRef.current += e.movementY;
    const totalDistance = Math.abs(dxRef.current) + Math.abs(dyRef.current);
    if (totalDistance <= 2) return;
    setInputState(NUMBER_DRAG_DRAGGING);
    if (direction === 'xy') {
      const newX = startValueRef.current.x + dxRef.current * step;
      const newY = startValueRef.current.y + dyRef.current * step;
      onChange(new Point(newX, newY));
    } else {
      let newValue = startValueRef.current + dxRef.current * step;
      if (min !== undefined && newValue < min) newValue = min;
      if (max !== undefined && newValue > max) newValue = max;
      onChange(newValue);
    }
  }).current;

  const onMouseUp = useRef((e) => {
    e.preventDefault();
    window.removeEventListener('mousemove', onMouseMove);
    window.removeEventListener('mouseup', onMouseUp);
    document.exitPointerLock();
    if (inputStateRef.current === NUMBER_DRAG_IDLE) {
      setInputState(NUMBER_DRAG_INPUT);
      setTempValue(roundToMaxPlaces(startValueRef.current));
      window.requestAnimationFrame(() => {
        inputRef.current?.select();
      });
    } else {
      setInputState(NUMBER_DRAG_IDLE);
    }
  }).current;

  const onMouseDown = (e) => {
    e.preventDefault();
    if (disabled) return;
    startValueRef.current = value;
    e.target.requestPointerLock();
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    dxRef.current = 0;
    dyRef.current = 0;
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

  const cursor = disabled ? 'cursor-default' : direction === 'xy' ? 'cursor-move' : 'cursor-col-resize';

  // Calculate fill percent for min/max indicator
  let percent = 0;
  if (typeof value === 'number' && min !== undefined && max !== undefined && max > min) {
    percent = (value - min) / (max - min);
    percent = Math.max(0, Math.min(1, percent));
  }
  const barColor = disabled ? 'bg-gray-700' : 'bg-gray-400';

  const indicator = (
    <div className="relative w-full h-0">
      <div className={`absolute left-0 bottom-0 h-0.5 ${barColor}`} style={{ width: percent === 0 ? 0 : `${percent * 100}%` }} />
    </div>
  );

  if (inputState !== NUMBER_DRAG_INPUT) {
    return (
      <div
        className={`flex-1 whitespace-nowrap border border-transparent bg-gray-800 ${cursor} ${
          disabled ? 'text-gray-700' : 'text-gray-400'
        } relative`}
        onMouseDown={onMouseDown}
      >
        <span className="py-2 px-1 block">{roundToMaxPlaces(value)}</span>
        {indicator}
      </div>
    );
  } else {
    return (
      <input
        ref={inputRef}
        className="flex-1 bg-gray-800 border border-gray-700 outline-none py-2 px-1 whitespace-nowrap text-gray-100 w-full"
        type="text"
        autoFocus={true}
        value={tempValue}
        onChange={(e) => setTempValue(e.target.value)}
        onKeyDown={onInputKey}
        onBlur={onInputEnd}
      />
    );
  }
}

function FloatParam({ port, label, value, min, max, step, disabled, onChange }) {
  const handleShowMenu = (e) => {
    e.preventDefault();
    e.stopPropagation();
    window.desktop.showPortContextMenu(port);
  };

  return (
    <>
      <label className="text-right text-gray-500 whitespace-nowrap">{label}</label>
      <NumberDrag label={label} value={value} min={min} max={max} step={step} disabled={disabled} onChange={onChange} />
      <Icon className="params__more" name="dots-vertical-rounded" fill="white" size="16" onClick={handleShowMenu} />
    </>
  );
}

function ToggleParam({ port, disabled, onChange }) {
  const handleShowMenu = (e) => {
    e.preventDefault();
    e.stopPropagation();
    window.desktop.showPortContextMenu(port);
  };

  return (
    <>
      <span className="w-32 mr-4"></span>
      <label className={`w-64 p-2 flex items-center ${disabled ? 'opacity-50' : ''}`}>
        <input type="checkbox" disabled={disabled} checked={!!port.value} onChange={(e) => onChange(e.target.checked)} />
        <span className="ml-2 text-gray-500">{port.label}</span>
      </label>
      <Icon className="params__more" name="dots-vertical-rounded" fill="white" size="16" onClick={handleShowMenu} />
    </>
  );
}

function ExpressionParam({ port, label, expression, onChange }) {
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
}

function StringParam({ port, label, value, disabled, onChange }) {
  const throttledOnChange = useRef(throttle(onChange, 200)).current;

  const handleShowMenu = (e) => {
    e.preventDefault();
    e.stopPropagation();
    window.desktop.showPortContextMenu(port);
  };

  return (
    <>
      <label className="text-right text-gray-500 whitespace-nowrap">{label}</label>
      <InlineEditor value={value} onChange={throttledOnChange} />
      <Icon className="params__more" name="dots-vertical-rounded" fill="white" size="16" onClick={handleShowMenu} />
    </>
  );
}

function SelectParam({ port, label, value, options, disabled, onChange }) {
  const handleShowMenu = (e) => {
    e.preventDefault();
    e.stopPropagation();
    window.desktop.showPortContextMenu(port);
  };

  const handleChange = (e) => {
    const selectedStr = e.target.value;
    const originalVal = options.find((opt) => String(opt) === selectedStr);
    onChange(originalVal !== undefined ? originalVal : selectedStr);
  };

  const stringValue = String(value);

  return (
    <>
      <label className="w-32 text-right text-gray-500 whitespace-nowrap">{label}</label>
      <select
        type="text"
        spellCheck="false"
        disabled={disabled}
        className={'flex-1 p-2 ' + (disabled ? 'bg-gray-800 text-gray-700' : 'bg-gray-700 text-gray-200')}
        value={stringValue}
        onChange={handleChange}
      >
        {options.map((option, index) => {
          if (option === '---') {
            return (
              <option disabled key={index}>
                ───────────────
              </option>
            );
          }
          const optStr = String(option);
          return (
            <option key={index} value={optStr}>
              {optStr}
            </option>
          );
        })}
      </select>
      <Icon className="params__more" name="dots-vertical-rounded" fill="white" size="16" onClick={handleShowMenu} />
    </>
  );
}

function ColorParam({ port, label, value, editorSplitterWidth, onChange }) {
  const [pickerVisible, setPickerVisible] = useState(false);

  const handleToggleColorPicker = () => {
    setPickerVisible(!pickerVisible);
  };

  const handleChange = (color) => {
    const { r, g, b, a } = color.rgb;
    onChange([r, g, b, a]);
  };

  const handleShowMenu = (e) => {
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
    right: `${editorSplitterWidth + 10}px`,
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
        onClick={handleToggleColorPicker}
      />
      <Icon className="params__more" name="dots-vertical-rounded" fill="white" size="16" onClick={handleShowMenu} />
      {pickerVisible && (
        <div style={popover}>
          <div style={cover} onClick={handleToggleColorPicker} />
          <ChromePicker color={pickerValue} onChange={handleChange} />
        </div>
      )}
    </>
  );
}

function PointParam({ port, label, value, onChange }) {
  const handleShowMenu = (e) => {
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
      <Icon className="params__more" name="dots-vertical-rounded" fill="white" size="16" onClick={handleShowMenu} />
    </>
  );
}

function FileParam({ label, value, fileType, onChange }) {
  const handleSelectFile = async () => {
    const filePath = await window.desktop.showOpenFileDialog(fileType);
    if (!filePath) return;
    const file = figment.filePathToRelative(filePath);
    onChange(file);
  };

  return (
    <>
      <label className="text-right text-gray-500 whitespace-nowrap">{label}</label>
      <div className="flex items-center overflow-hidden">
        <span className="flex-1 text-gray-400 truncate whitespace-nowrap" onClick={handleSelectFile} title={value}>
          {value}
        </span>
        <button className="w-32 ml-2 bg-gray-800 text-gray-300 p-2 focus:outline-none" onClick={handleSelectFile}>
          Open…
        </button>
      </div>
      <span />
    </>
  );
}

function DirectoryParam({ label, value, onChange }) {
  const handleSelectDirectory = async () => {
    const filePath = await window.desktop.showOpenDirectoryDialog();
    if (!filePath) return;
    const directory = figment.filePathToRelative(filePath);
    onChange(directory);
  };

  return (
    <>
      <label className="w-32 text-right text-gray-500 mr-4 whitespace-nowrap">{label}</label>
      <div className="flex items-center overflow-hidden">
        <span className="w-32 text-gray-400 truncate" onClick={handleSelectDirectory} title={value}>
          {value}
        </span>
        <button className="w-32 ml-2 bg-gray-800 text-gray-300 p-2 focus:outline-none" onClick={handleSelectDirectory}>
          Open…
        </button>
      </div>
      <span />
    </>
  );
}

export default function ParamsEditor() {
  const network = useAppStore((s) => s.network);
  const selection = useAppStore((s) => s.selection);
  const editorSplitterWidth = useAppStore((s) => s.editorSplitterWidth);
  const openNodeRenameDialog = useAppStore((s) => s.openNodeRenameDialog);
  const changePortValue = useAppStore((s) => s.changePortValue);
  const changePortExpression = useAppStore((s) => s.changePortExpression);
  const revertPortValue = useAppStore((s) => s.revertPortValue);
  const triggerButton = useAppStore((s) => s.triggerButton);
  useAppStore((s) => s.version); // Subscribe to version to trigger re-renders on port changes

  const [trackedPortValues, setTrackedPortValues] = useState({});
  const [error, setError] = useState(null);

  // Use refs to avoid stale closures in event listeners
  const trackedPortValuesRef = useRef({});
  const errorRef = useRef(null);

  // Keep refs in sync with state
  useEffect(() => {
    trackedPortValuesRef.current = trackedPortValues;
    errorRef.current = error;
  }, [trackedPortValues, error]);

  const getTrackablePorts = (node) => {
    if (!node) return [];
    // Only track connected toggle ports, as their value can change externally and they are visible in the inspector.
    const currentNetwork = useAppStore.getState().network;
    return node.inPorts.filter((port) => port.type === PORT_TYPE_TOGGLE && currentNetwork.isConnected(port));
  };

  const updateTrackedPortValues = () => {
    const currentSelection = useAppStore.getState().selection;
    if (currentSelection.size !== 1) {
      if (Object.keys(trackedPortValuesRef.current).length > 0 || errorRef.current) {
        setTrackedPortValues({});
        setError(null);
      }
      return;
    }
    const node = Array.from(currentSelection)[0];
    const trackablePorts = getTrackablePorts(node);
    const newTrackedValues = {};
    for (const port of trackablePorts) {
      newTrackedValues[port.name] = port.value;
    }
    // Only update state if the values have actually changed to avoid an extra render cycle.
    if (JSON.stringify(trackedPortValuesRef.current) !== JSON.stringify(newTrackedValues) || errorRef.current !== node.error) {
      setTrackedPortValues(newTrackedValues);
      setError(node.error);
    }
  };

  const onNetworkChange = () => {
    const currentSelection = useAppStore.getState().selection;
    if (currentSelection.size !== 1) return;

    const node = Array.from(currentSelection)[0];
    const trackablePorts = getTrackablePorts(node);

    let needsUpdate = false;
    const newTrackedValues = { ...trackedPortValuesRef.current };

    for (const port of trackablePorts) {
      if (trackedPortValuesRef.current[port.name] !== port.value) {
        newTrackedValues[port.name] = port.value;
        needsUpdate = true;
      }
    }

    if (node.error !== errorRef.current) {
      needsUpdate = true;
    }

    if (needsUpdate) {
      setTrackedPortValues(newTrackedValues);
      setError(node.error);
    }
  };

  useEffect(() => {
    const initialNetwork = useAppStore.getState().network;
    initialNetwork.addChangeListener(onNetworkChange);
    updateTrackedPortValues();

    // Subscribe to network changes from Zustand
    let currentNetwork = initialNetwork;
    const unsubscribe = useAppStore.subscribe((state, prevState) => {
      if (state.network !== prevState.network) {
        if (currentNetwork !== state.network) {
          currentNetwork.removeChangeListener(onNetworkChange);
          state.network.addChangeListener(onNetworkChange);
          currentNetwork = state.network;
        }
      }
      // Update tracked port values when selection changes
      if (state.selection !== prevState.selection) {
        updateTrackedPortValues();
      }
    });

    return () => {
      currentNetwork.removeChangeListener(onNetworkChange);
      unsubscribe();
    };
  }, []);

  const handleChangePortValue = (portName, value) => {
    selection.forEach((node) => {
      changePortValue(node, portName, value);
    });
  };

  const handleChangePortExpression = (portName, expression) => {
    selection.forEach((node) => {
      changePortExpression(node, portName, expression);
    });
  };

  const handleTriggerButton = (port) => {
    selection.forEach((node) => {
      triggerButton(node, port);
    });
  };

  const renderPort = (network, node, port) => {
    let field;
    if (port._value.type === 'expression') {
      field = (
        <ExpressionParam
          key={port.name}
          port={port}
          label={port.label}
          expression={port._value.expression}
          disabled={network.isConnected(port)}
          onChange={(expr) => handleChangePortExpression(port.name, expr)}
        />
      );
    } else if (port.type === PORT_TYPE_TRIGGER) {
      return null;
    } else if (port.type === PORT_TYPE_BUTTON) {
      field = (
        <React.Fragment key={port.name}>
          <span className="w-32 mr-4"></span>
          <button
            className="bg-gray-600 text-gray-200 w-32 p-2"
            disabled={network.isConnected(port)}
            onClick={() => handleTriggerButton(port)}
          >
            {port.label}
          </button>
          <span />
        </React.Fragment>
      );
    } else if (port.type === PORT_TYPE_TOGGLE) {
      field = (
        <ToggleParam
          key={port.name}
          port={port}
          label={port.label}
          value={port.value}
          disabled={network.isConnected(port)}
          onChange={(value) => handleChangePortValue(port.name, value)}
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
          onChange={(value) => handleChangePortValue(port.name, value)}
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
          onChange={(value) => handleChangePortValue(port.name, value)}
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
          onChange={(value) => handleChangePortValue(port.name, value)}
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
          onChange={(value) => handleChangePortValue(port.name, value)}
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
          onChange={(value) => handleChangePortValue(port.name, value)}
          editorSplitterWidth={editorSplitterWidth}
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
          onChange={(value) => handleChangePortValue(port.name, value)}
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
          onChange={(value) => handleChangePortValue(port.name, value)}
        />
      );
    }
    return field;
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
  const errorLines = node.error ? node.error.split('\n') : [];
  const errorTitle = errorLines[0] || 'Error';
  const stackLines = errorLines.slice(1);
  const cleanedStackLines = stackLines.map((line) => {
    const match = line.match(/\((.*)\)/);
    if (match && match[1]) {
      const path = match[1];
      if (path.startsWith('http://') || path.startsWith('https://') || path.startsWith('file:///')) {
        return line.replace(/\s\(.*\)$/, '');
      }
    }
    return line;
  });
  const errorStack = cleanedStackLines.join('\n');

  return (
    <div className="params">
      <div className="params__header">
        <span className="text-gray-200 hover:bg-gray-700 px-2 py-1" onClick={() => openNodeRenameDialog(node)}>
          {node.name}
        </span>
        <span className="text-gray-500 text-xs ml-3">{node.type}</span>
      </div>
      {node.error && (
        <div className="bg-gray-900 text-white text-xs font-mono shadow border-l-2 border-red-500">
          <div className="p-2">
            <pre className="whitespace-pre-wrap flex-1 mb-2">{errorTitle}</pre>
            <pre className="whitespace-pre-wrap">{errorStack}</pre>
          </div>
        </div>
      )}
      <div className="params__grid grid ">{node.inPorts.map((port) => renderPort(network, node, port))}</div>
    </div>
  );
}
