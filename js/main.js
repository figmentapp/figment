import { h, Component, render } from 'preact';
import CodeMirror from 'codemirror';
import 'codemirror/mode/javascript/javascript.js';
import 'codemirror/theme/darcula.css';
import { COLORS } from './colors';
import { sourceCanvas, sourceBackgroundColor, sourceRect } from './sources';
import { Point, rgbToHex } from './g';
import * as g from './g';

const NODE_PORT_SIZE = 15;
const NODE_WIDTH = NODE_PORT_SIZE * 5;
const NODE_HEIGHT = NODE_PORT_SIZE * 2;

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
    { outNode: 2, inNode: 3, outPort: 'out', inPort: 'in' },
  ],
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

class Port {
  constructor(node, name, type, value) {
    this.node = node;
    this.name = name;
    this.type = type;
    this.value = value;
  }

  trigger(props) {
    this.node._triggerOut(this, props);
  }
}


class Node {
  constructor(network, id, name, type, x, y) {
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
    const inPort = new Port(this, name, PORT_TYPE_TRIGGER);
    this.inPorts.push(inPort);
    return inPort;
  }

  inFloat(name, value) {
    const inPort = new Port(this, name, PORT_TYPE_FLOAT, value);
    this.inPorts.push(inPort);
    return inPort;
  }

  inPoint(name, value) {
    const inPort = new Port(this, name, PORT_TYPE_POINT, value && value.clone());
    this.inPorts.push(inPort);
    return inPort;
  }

  inColor(name, value) {
    const inPort = new Port(this, name, PORT_TYPE_COLOR, value);
    this.inPorts.push(inPort);
    return inPort;
  }

  triggerOut(name) {
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
      node.source = nodeObj.source;
      node.function = new Function('node', node.source);
      //const fn = NODE_FUNCTIONS[node.type];
      node.function.call({ Point }, node);
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
}

const coreCanvas = (node) => {
  const triggerOut = node.triggerOut('out');
  node.onStart = (props) => {
    console.log('STARTING DA NODE.');
     const canvas = document.createElement('canvas');
     canvas.width = 400;
     canvas.height = 400;
     const viewer = document.getElementById('viewer');
     viewer.innerHTML = '';
     viewer.appendChild(canvas);
     const ctx = canvas.getContext('2d');
     triggerOut.trigger({ canvas, ctx });
  };
};

const coreBackgroundColor = (node) => {
  const triggerIn = node.triggerIn('in');
  const triggerOut = node.triggerOut('out');
  const inColor = node.inColor('color', [200, 200, 200, 1]);

  triggerIn.onTrigger = (props) => {
    const { canvas, ctx } = props;
    ctx.fillStyle = _rgbToHex(...inColor.value);
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    triggerOut.trigger(props);
  };
};

const coreBlend = (node) => {
  const triggerIn = node.triggerIn('in');
  const triggerOut = node.triggerOut('out');
};

const coreRect = (node) => {
  const triggerIn = node.triggerIn('in');
  const triggerOut = node.triggerOut('out');
  const inColor = node.inColor('color', [50, 50, 150, 1]);
  const inPosition = node.inPoint('position', new Point(100, 100));
  const inRadius = node.inFloat('radius', 50, { min: 0, max: 1000 });
  triggerIn.onTrigger = (props) => {
    const { canvas, ctx } = props;
    const pos = inPosition.value;
    const r = inRadius.value;
    ctx.save();
    ctx.fillStyle = _rgbToHex(...inColor.value);
    ctx.translate(pos.x, pos.y);
    ctx.fillRect(-r, -r, r * 2, r * 2);
    ctx.restore();
  }
}

const NODE_FUNCTIONS = {
  'core.canvas': coreCanvas,
  'core.backgroundColor': coreBackgroundColor,
  'core.blend': coreBlend,
  'core.rect': coreRect,
}


class NetworkEditor extends Component {
  constructor(props) {
    super(props);
    this.state = { x: 0, y: 0, scale: 1.0 };
    this._onMouseDown = this._onMouseDown.bind(this);
    this._onMouseMove = this._onMouseMove.bind(this);
    this._onMouseUp = this._onMouseUp.bind(this);
  }

  componentDidMount() {
    this.canvas = document.getElementById('network');
    this.ctx = this.canvas.getContext('2d');
    const bounds = this.canvas.parentNode.getBoundingClientRect();
    this.canvas.style.width = `${bounds.width}px`;
    this.canvas.style.height = `${bounds.height}px`;
    this.canvas.width = bounds.width * 2;
    this.canvas.height = bounds.height * 2;
    this._draw();
  }

  render() {
    return (
      <div class="network">
        <canvas class="network__canvas" id="network" onMouseDown={this._onMouseDown} />
      </div>
    );
  }

  componentDidUpdate() {
    this._draw();
  }

  _onMouseDown(e) {
    window.addEventListener('mousemove', this._onMouseMove);
    window.addEventListener('mouseup', this._onMouseUp);
    this.prevX = e.clientX;
    this.prevY = e.clientY;
    const mouseX = e.clientX - this.state.x;
    const mouseY = e.clientY - this.state.y;
    for (const node of this.props.network.nodes) {
      if (_hitTest(node, mouseX, mouseY)) {
        this.props.onSelectNode(node);
        return;
      }
    }
    this.props.onClearSelection();
  }

  _onMouseMove(e) {
    const dx = e.clientX - this.prevX;
    const dy = e.clientY - this.prevY;
    this.setState({ x: this.state.x + dx, y: this.state.y + dy });
    this.prevX = e.clientX;
    this.prevY = e.clientY;
  }

  _onMouseUp() {
    window.removeEventListener('mousemove', this._onMouseMove);
    window.removeEventListener('mouseup', this._onMouseUp);
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
        ctx.fillRect(node.x + i * NODE_PORT_SIZE, node.y + NODE_PORT_SIZE, NODE_PORT_SIZE, NODE_PORT_SIZE);
      }
      ctx.fillRect(node.x, node.y + NODE_PORT_SIZE, NODE_PORT_SIZE, NODE_PORT_SIZE);
    }
    ctx.fillStyle = COLORS.gray300;
    ctx.font = '12px SF Mono';
    for (const node of network.nodes) {
      ctx.fillText(node.name, node.x  + NODE_PORT_SIZE * 6 , node.y + NODE_PORT_SIZE * 1.3);
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
    console.log(props);
    this.state = { source: props.node.source }
  }

  componentDidMount() {
    const $code = document.getElementById('code');
    this.editor = CodeMirror.fromTextArea($code, {
      lineNumbers: true,
      mode: 'javascript',
      theme: 'darcula'
    });
  }

  render() {
    return (<div class="code"><textarea class="code__area" id="code" value={this.state.source}/></div>)
  }
}

class ParamsEditor extends Component {
  constructor(props) {
    super(props);
  }
  render({ selection }) {
    if (selection.size === 0) {
      return (<div class="params"><p class="params__empty">Nothing selected</p></div>);
    }
    if (selection.size > 1) {
     return (<div class="params"><p class="params__empty">Many nodes selected</p></div>);
    }
    const node = Array.from(selection)[0];
    return (
      <div class="params">
        <div class="params__title">{node.name}</div>
        <div class="params__header">IN</div>
        { node.inPorts.map(port => <div class="params__port">{port.name}</div>) }
        <div class="params__header">OUT</div>
        { node.outPorts.map(port => <div class="params__port">{port.name}</div>) }
      </div>
     );
  }
}

class Editor extends Component {
  constructor(props) {
    super(props);
    this.state = { tabs: [props.network.nodes[0]], activeTabIndex: -1 };
    this._addTab = this._addTab.bind(this);
  }

  _addTab(node) {
    const { tabs } = this.state;
    tabs.push(node);
    this.setState({ tabs });
  }

  render({ network, selection, onSelectNode, onClearSelection }, { tabs, activeTabIndex }) {
    return (
      <div class="editor">
        <div class="editor__tabs">
          <div class={'editor__tab' + activeTabIndex === -1 ? ' editor__tab--active' : '' }>Network</div>
          { tabs.map((node, i) => <div class={'editor__tab' + activeTabIndex === i ? ' editor__tab--active' : ''}>{node.name}</div>) }
          { activeTabIndex === -1 && <NetworkEditor network={network} selection={selection} onSelectNode={onSelectNode} onClearSelection={onClearSelection} /> }
          { activeTabIndex >= 0 && <CodeEditor node={tabs[activeTabIndex]} /> }
        </div>
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

  render(_, { network, selection }) {
    return (
      <div class="app">
        <Editor network={network} selection={selection} onSelectNode={this._onSelectNode}  onClearSelection={this._onClearSelection} />
        <div class="viewer" id="viewer"></div>
        <ParamsEditor selection={selection} />
      </div>
    );
  }
}

window.g = g;

render(<App />, document.getElementById('root'));
