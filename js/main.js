import { h, Component, render } from 'preact';
import CodeMirror from 'codemirror';
import 'codemirror/mode/javascript/javascript.js';
import 'codemirror/theme/darcula.css';
import { COLORS } from './colors';
import { sourceCanvas, sourceBackgroundColor, sourceRect } from './sources';
import * as g from './g';

const NODE_PORT_SIZE = 15;
const NODE_WIDTH = NODE_PORT_SIZE * 5;
const NODE_HEIGHT = NODE_PORT_SIZE * 2;
const EDITOR_TABS_HEIGHT = 30;
const FONT_FAMILY_MONO = `'SF Mono', Menlo, Consolas, Monaco, 'Liberation Mono', 'Lucida Console', monospace`;

const DEFAULT_NETWORK = {
  nodes: [
    {
      id: 1,
      name: 'Canvas',
      type: 'core.canvas',
      source: sourceCanvas,
      x: 50,
      y: 50
    },
    {
      id: 2,
      name: 'Background Color',
      type: 'core.backgroundColor',
      source: sourceBackgroundColor,
      x: 50,
      y: 150
    },
    {
      id: 3,
      name: 'Rectangle',
      type: 'core.rect',
      source: sourceRect,
      x: 100,
      y: 300
    }
  ],
  connections: [
    { outNode: 1, inNode: 2, outPort: 'out', inPort: 'in' },
    { outNode: 2, inNode: 3, outPort: 'out', inPort: 'in' }
  ]
};

function _hitTest(node, x, y) {
  const x1 = node.x;
  const x2 = x1 + NODE_WIDTH;
  const y1 = node.y;
  const y2 = y1 + NODE_HEIGHT;
  return x >= x1 && x <= x2 && y >= y1 && y <= y2;
}

const PORT_TYPE_TRIGGER = 'trigger';
const PORT_TYPE_FLOAT = 'float';
const PORT_TYPE_COLOR = 'color';
const PORT_TYPE_POINT = 'point';

let gPortId = 0;

class Port {
  constructor(node, name, type, value) {
    this.__id = ++gPortId;
    this.node = node;
    this.name = name;
    this.type = type;
    this.value = value;
  }

  trigger(props) {
    this.node._triggerOut(this, props);
  }
}

let gNodeId = 0;

class Node {
  constructor(network, id, name, type, x, y) {
    this.__id = ++gNodeId;
    this.network = network;
    this.id = id;
    this.name = name;
    this.type = type;
    this.x = x;
    this.y = y;
    this.inPorts = [];
    this.outPorts = [];
  }

  triggerIn(name) {
    const oldPort = this.inPorts.find(p => p.name === name);
    if (oldPort) return oldPort;
    const inPort = new Port(this, name, PORT_TYPE_TRIGGER);
    this.inPorts.push(inPort);
    return inPort;
  }

  inFloat(name, value) {
    const oldPort = this.inPorts.find(p => p.name === name);
    if (oldPort) {
      oldPort.value = value;
      return oldPort;
    } else {
      const inPort = new Port(this, name, PORT_TYPE_FLOAT, value);
      this.inPorts.push(inPort);
      return inPort;
    }
  }

  inPoint(name, value) {
    const oldPort = this.inPorts.find(p => p.name === name);
    if (oldPort) {
      oldPort.value = value;
      return oldPort;
    } else {
      const inPort = new Port(this, name, PORT_TYPE_POINT, value && value.clone());
      this.inPorts.push(inPort);
      return inPort;
    }
  }

  inColor(name, value) {
    const oldPort = this.inPorts.find(p => p.name === name);
    if (oldPort) {
      oldPort.value = value;
      return oldPort;
    } else {
      const inPort = new Port(this, name, PORT_TYPE_COLOR, value);
      this.inPorts.push(inPort);
      return inPort;
    }
  }

  triggerOut(name) {
    const oldPort = this.outPorts.find(p => p.name === name);
    if (oldPort) return oldPort;
    const outPort = new Port(this, name, PORT_TYPE_TRIGGER);
    this.outPorts.push(outPort);
    return outPort;
  }

  _triggerOut(outPort, props) {
    // Find if this node is connected.
    const connections = this.network.connections.filter(conn => conn.outNode === this.id);
    for (const conn of connections) {
      const inNode = this.network.nodes.find(node => node.id === conn.inNode);
      const inPort = inNode.inPorts.find(port => port.name === conn.inPort);
      inPort && inPort.onTrigger && inPort.onTrigger(props);
    }
  }
}

class Network {
  constructor() {
    this.nodes = [];
    this.connections = [];
  }

  parse(obj) {
    for (const nodeObj of obj.nodes) {
      const node = new Node(this, nodeObj.id, nodeObj.name, nodeObj.type, nodeObj.x, nodeObj.y);
      node.source = nodeObj.source.trim();
      node.function = new Function('node', node.source);
      node.function.call(window, node);
      this.nodes.push(node);
    }
    for (const connObj of obj.connections) {
      this.connections.push(connObj);
    }
  }

  start() {
    for (const node of this.nodes) {
      if (node.onStart) {
        node.onStart(node);
      }
    }
  }

  stop() {
    for (const node of this.nodes) {
      if (node.onStop) {
        node.onStop(node);
      }
    }
  }

  restart() {
    this.stop();
    for (const node of this.nodes) {
      node.function = new Function('node', node.source);
      node.function.call(window, node);
    }
    this.start();
  }

  doFrame() {
    for (const node of this.nodes) {
      if (node.onFrame) {
        node.onFrame(node);
      }
    }
  }

  setNodeSource(node, source) {
    if (node.onStop) {
      node.onStop(node);
    }
    node.source = source;
    node.function = new Function('node', node.source);
    node.function.call(window, node);
    if (node.onStart) {
      node.onStart(node);
    }
    this.doFrame();
  }

  setPortValue(node, portName, value) {
    const port = node.inPorts.find(p => p.name === portName);
    console.assert(port, `Port ${name} does not exist.`);
    port.value = value;
    this.doFrame();
  }
}

class NetworkEditor extends Component {
  constructor(props) {
    super(props);
    this.state = { x: 0, y: 0, scale: 1.0 };
    this._onMouseDown = this._onMouseDown.bind(this);
    this._onMouseMove = this._onMouseMove.bind(this);
    this._onMouseUp = this._onMouseUp.bind(this);
    this._onDoubleClick = this._onDoubleClick.bind(this);
  }

  componentDidMount() {
    this.canvas = document.getElementById('network');
    this.ctx = this.canvas.getContext('2d');
    const bounds = this.canvas.parentNode.getBoundingClientRect();
    this.canvas.style.width = `${bounds.width}px`;
    this.canvas.style.height = `${bounds.height}px`;
    this.canvas.width = bounds.width * window.devicePixelRatio;
    this.canvas.height = bounds.height * window.devicePixelRatio;
    this._draw();
  }

  render() {
    return (
      <div class="network">
        <canvas
          class="network__canvas"
          id="network"
          onMouseDown={this._onMouseDown}
          onDblClick={this._onDoubleClick}
        />
      </div>
    );
  }

  componentDidUpdate() {
    this._draw();
  }

  _findNode(x, y) {
    for (const node of this.props.network.nodes) {
      if (_hitTest(node, x, y)) {
        return node;
      }
    }
  }

  _networkPosition(e) {
    const mouseX = e.clientX;
    const mouseY = e.clientY - EDITOR_TABS_HEIGHT;
    const networkX = mouseX - this.state.x;
    const networkY = mouseY - this.state.y;
    return [networkX, networkY];
  }

  _onMouseDown(e) {
    window.addEventListener('mousemove', this._onMouseMove);
    window.addEventListener('mouseup', this._onMouseUp);
    const mouseX = e.clientX;
    const mouseY = e.clientY - EDITOR_TABS_HEIGHT;
    this.prevX = mouseX;
    this.prevY = mouseY;
    const [networkX, networkY] = this._networkPosition(e);
    const node = this._findNode(networkX, networkY);
    if (node) {
      this.props.onSelectNode(node);
    } else {
      this.props.onClearSelection();
    }
  }

  _onMouseMove(e) {
    const mouseX = e.clientX;
    const mouseY = e.clientY - EDITOR_TABS_HEIGHT;
    const dx = mouseX - this.prevX;
    const dy = mouseY - this.prevY;
    this.setState({ x: this.state.x + dx, y: this.state.y + dy });
    this.prevX = mouseX;
    this.prevY = mouseY;
  }

  _onMouseUp() {
    window.removeEventListener('mousemove', this._onMouseMove);
    window.removeEventListener('mouseup', this._onMouseUp);
  }

  _onDoubleClick(e) {
    const [networkX, networkY] = this._networkPosition(e);
    const node = this._findNode(networkX, networkY);
    if (node) {
      this.props.onOpenCode(node);
    }
  }

  _draw() {
    const { canvas, ctx } = this;
    const { network, selection } = this.props;
    const ratio = window.devicePixelRatio;
    ctx.setTransform(ratio, 0.0, 0.0, ratio, this.state.x * ratio, this.state.y * ratio);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const nodeColors = [COLORS.gray400, COLORS.gray500, COLORS.gray600];
    for (const node of network.nodes) {
      if (selection.has(node)) {
        ctx.fillStyle = COLORS.gray600;
        ctx.fillRect(node.x - 3, node.y - 3, NODE_WIDTH + 6, NODE_HEIGHT + 6);
      }
      ctx.fillStyle = COLORS.gray700;
      ctx.fillRect(node.x, node.y, NODE_PORT_SIZE * 5, NODE_PORT_SIZE * 2);
      for (let i = 0; i < node.inPorts.length; i++) {
        ctx.fillStyle = nodeColors[i % nodeColors.length];
        ctx.fillRect(node.x + i * NODE_PORT_SIZE, node.y, NODE_PORT_SIZE, NODE_PORT_SIZE);
      }
      for (let i = 0; i < node.outPorts.length; i++) {
        ctx.fillStyle = nodeColors[(i + 1) % nodeColors.length];
        ctx.fillRect(
          node.x + i * NODE_PORT_SIZE,
          node.y + NODE_PORT_SIZE,
          NODE_PORT_SIZE,
          NODE_PORT_SIZE
        );
      }
      ctx.fillRect(node.x, node.y + NODE_PORT_SIZE, NODE_PORT_SIZE, NODE_PORT_SIZE);
    }
    ctx.fillStyle = COLORS.gray300;
    ctx.font = `12px ${FONT_FAMILY_MONO}`;
    for (const node of network.nodes) {
      ctx.fillText(node.name, node.x + NODE_PORT_SIZE * 6, node.y + NODE_PORT_SIZE * 1.3);
    }
    ctx.strokeStyle = COLORS.gray200;
    ctx.strokeWidth = 2;
    ctx.beginPath();
    for (const conn of network.connections) {
      const outNode = network.nodes.find(node => node.id === conn.outNode);
      const outPortIndex = outNode.outPorts.findIndex(port => port.name === conn.outPort);
      const inNode = network.nodes.find(node => node.id === conn.inNode);
      const inPortIndex = inNode.inPorts.findIndex(port => port.name === conn.inPort);
      const outX = outNode.x + outPortIndex * NODE_PORT_SIZE + NODE_PORT_SIZE / 2;
      const outY = outNode.y + NODE_PORT_SIZE * 2;
      const inX = inNode.x + inPortIndex * NODE_PORT_SIZE + NODE_PORT_SIZE / 2;
      const inY = inNode.y;
      const halfDy = Math.abs(inY - outY) / 2.0;
      ctx.moveTo(outX, outY);
      ctx.bezierCurveTo(outX, outY + halfDy, inX, inY - halfDy, inX, inY);
    }
    ctx.stroke();
  }
}

class CodeEditor extends Component {
  constructor(props) {
    super(props);
    this.state = { source: props.node.source };
    //this._onKeyDown = this._onKeyDown.bind(this);
  }

  componentDidUpdate(prevProps) {
    if (prevProps.node !== this.props.node) {
      this.setState({ source: this.props.node.source });
      this.editor.setValue(this.props.node.source);
    }
  }

  componentDidMount() {
    const $code = document.getElementById('code');
    this.editor = CodeMirror.fromTextArea($code, {
      lineNumbers: true,
      mode: 'javascript',
      theme: 'darcula'
    });
    this.editor.setOption('extraKeys', {
      'Shift-Enter': () => {
        try {
          this.props.onChangeSource(this.props.node, this.editor.getValue());
        } catch (e) {
          console.error(e);
        }
        return false;
      }
    });
  }

  render() {
    return (
      <div class="code">
        <textarea class="code__area" id="code" value={this.state.source} />
      </div>
    );
  }
}

class NumberDrag extends Component {
  constructor(props) {
    super(props);
    this._onMouseDown = this._onMouseDown.bind(this);
    this._onMouseMove = this._onMouseMove.bind(this);
    this._onMouseUp = this._onMouseUp.bind(this);
  }

  _onMouseDown(e) {
    e.target.requestPointerLock();
    window.addEventListener('mousemove', this._onMouseMove);
    window.addEventListener('mouseup', this._onMouseUp);
  }

  _onMouseMove(e) {
    this.props.onChange(this.props.value + e.movementX);
  }

  _onMouseUp(e) {
    window.removeEventListener('mousemove', this._onMouseMove);
    window.removeEventListener('mouseup', this._onMouseUp);
    document.exitPointerLock();
  }

  render({ label, value }) {
    return (
      <span class="params__label" onMouseDown={this._onMouseDown}>
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
      <div class="params__row">
        <NumberDrag label={label} value={value} onChange={onChange} />
        <input
          type="text"
          spellcheck="false"
          class="params__field"
          value={value}
          onChange={this._onChange}
        />
      </div>
    );
  }
}

class ParamsEditor extends Component {
  constructor(props) {
    super(props);
    this._onChangePortValue = this._onChangePortValue.bind(this);
  }

  _onChangePortValue(portName, value) {
    this.props.selection.forEach(node => {
      this.props.onChangePortValue(node, portName, value);
    });
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
        <div class="params__title">{node.name}</div>
        <div class="params__header">IN</div>
        {node.inPorts.map(port => this._renderPort(node, port))}
        <div class="params__header">OUT</div>
        {node.outPorts.map(port => (
          <div class="params__port">{port.name}</div>
        ))}
      </div>
    );
  }

  _renderPort(node, port) {
    let field;
    if (port.type === 'float') {
      field = (
        <FloatParam
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

class Editor extends Component {
  constructor(props) {
    super(props);
    this.state = { tabs: [props.network.nodes[1]], activeTabIndex: -1 };
    this._addTab = this._addTab.bind(this);
    this._onSelectTab = this._onSelectTab.bind(this);
    this._onOpenCode = this._onOpenCode.bind(this);
  }

  _addTab(node) {
    const { tabs } = this.state;
    tabs.push(node);
    this.setState({ tabs });
  }

  _onOpenCode(node) {
    if (this.state.tabs.includes(node)) {
      this.setState({ activeTabIndex: this.state.tabs.indexOf(node) });
      return;
    }
    this._addTab(node);
    this.setState({ activeTabIndex: this.state.tabs.length - 1 });
  }

  _onSelectTab(index) {
    this.setState({ activeTabIndex: index });
  }

  _onCloseTab(e, index) {
    e.stopPropagation();
    const { tabs } = this.state;
    tabs.splice(index, 1);
    this.setState({ tabs, activeTabIndex: tabs.length - 1 });
  }

  render(
    { network, selection, onSelectNode, onClearSelection, onChangeSource },
    { tabs, activeTabIndex }
  ) {
    return (
      <div class="editor">
        <div class="editor__tabs">
          <div
            class={'editor__tab' + (activeTabIndex === -1 ? ' editor__tab--active' : '')}
            onClick={() => this._onSelectTab(-1)}
          >
            Network
          </div>
          {tabs.map((node, i) => (
            <div
              class={'editor__tab' + (activeTabIndex === i ? ' editor__tab--active' : '')}
              onClick={() => this._onSelectTab(i)}
            >
              <span class="editor__tab-name">{node.name}</span>
              <a class="editor__tab-close" onClick={e => this._onCloseTab(e, i)}>
                <svg viewBox="0 0 16 16" width="16" height="16">
                  <path d="M4 4L12 12M12 4L4 12" />
                </svg>
              </a>
            </div>
          ))}
        </div>
        {activeTabIndex === -1 && (
          <NetworkEditor
            network={network}
            selection={selection}
            onSelectNode={onSelectNode}
            onClearSelection={onClearSelection}
            onOpenCode={this._onOpenCode}
          />
        )}
        {activeTabIndex >= 0 && (
          <CodeEditor node={tabs[activeTabIndex]} onChangeSource={onChangeSource} />
        )}
      </div>
    );
  }
}

class App extends Component {
  constructor(props) {
    super(props);
    const network = new Network();
    network.parse(DEFAULT_NETWORK);
    this.state = { network, selection: new Set() };
    this._onSelectNode = this._onSelectNode.bind(this);
    this._onClearSelection = this._onClearSelection.bind(this);
    this._onChangeSource = this._onChangeSource.bind(this);
    this._onChangePortValue = this._onChangePortValue.bind(this);
  }

  componentDidMount() {
    this.state.network.start();
  }

  _onSelectNode(node) {
    const { selection } = this.state;
    selection.clear();
    selection.add(node);
    // if (selection.has(node)) {
    //   selection.delete(node);
    // } else {
    //   selection.add(node);
    // }
    this.forceUpdate();
    //this.setState({ selection: })
  }

  _onClearSelection() {
    const { selection } = this.state;
    selection.clear();
    this.forceUpdate();
  }

  _onChangeSource(node, source) {
    this.state.network.setNodeSource(node, source);
    this.forceUpdate();
  }

  _onChangePortValue(node, portName, value) {
    this.state.network.setPortValue(node, portName, value);
    this.forceUpdate();
  }

  render(_, { network, selection }) {
    return (
      <div class="app">
        <Editor
          network={network}
          selection={selection}
          onSelectNode={this._onSelectNode}
          onClearSelection={this._onClearSelection}
          onChangeSource={this._onChangeSource}
        />
        <div class="viewer" id="viewer" />
        <ParamsEditor
          network={network}
          selection={selection}
          onChangePortValue={this._onChangePortValue}
        />
      </div>
    );
  }
}

window.g = g;

render(<App />, document.getElementById('root'));
