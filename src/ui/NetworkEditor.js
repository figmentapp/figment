import { h, Component } from 'preact';
import { COLORS } from '../colors';
import { Point } from '../g';
import { clamp } from '../util';
import {
  PORT_TYPE_TRIGGER,
  PORT_TYPE_TOGGLE,
  PORT_TYPE_NUMBER,
  PORT_TYPE_STRING,
  PORT_TYPE_COLOR,
  PORT_TYPE_POINT,
  PORT_TYPE_FILE,
  PORT_TYPE_IMAGE,
  PORT_TYPE_OBJECT,
  PORT_IN,
  PORT_OUT
} from '../model/Port';

const FONT_FAMILY_MONO = `'SF Mono', Menlo, Consolas, Monaco, 'Liberation Mono', 'Lucida Console', monospace`;

const NODE_PORT_WIDTH = 15;
const NODE_PORT_HEIGHT = 5;
const NODE_HEIGHT = 30;
const EDITOR_TABS_HEIGHT = 30;

const DRAG_MODE_IDLE = 'idle';
const DRAG_MODE_PANNING = 'panning';
const DRAG_MODE_DRAG_NODE = 'drag_node';
const DRAG_MODE_DRAG_PORT = 'drag_port';
const DRAG_MODE_SELECTING = 'selecting';

const PORT_COLORS = {
  [PORT_TYPE_TRIGGER]: COLORS.yellow400,
  [PORT_TYPE_TOGGLE]: COLORS.orange300,
  [PORT_TYPE_NUMBER]: COLORS.gray500,
  [PORT_TYPE_STRING]: COLORS.indigo600,
  [PORT_TYPE_COLOR]: COLORS.gray600,
  [PORT_TYPE_POINT]: COLORS.gray700,
  [PORT_TYPE_FILE]: COLORS.gray400,
  [PORT_TYPE_IMAGE]: COLORS.green500,
  [PORT_TYPE_OBJECT]: COLORS.gray800
};

function _nodeWidth(node) {
  let portCount = Math.max(node.inPorts.length, node.outPorts.length);
  if (portCount < 6) return 100;
  return portCount * NODE_PORT_WIDTH;
}

function _hitTest(node, x, y) {
  const x1 = node.x;
  const x2 = x1 + _nodeWidth(node);
  const y1 = node.y;
  const y2 = y1 + NODE_HEIGHT;
  return x >= x1 && x <= x2 && y >= y1 && y <= y2;
}

export default class NetworkEditor extends Component {
  constructor(props) {
    super(props);
    this.state = { x: 0, y: 0, scale: 1.0 };
    this._onMouseDown = this._onMouseDown.bind(this);
    this._onMouseMove = this._onMouseMove.bind(this);
    this._onMouseDrag = this._onMouseDrag.bind(this);
    this._onMouseUp = this._onMouseUp.bind(this);
    this._onDoubleClick = this._onDoubleClick.bind(this);
    this._onKeyDown = this._onKeyDown.bind(this);
    this._onKeyUp = this._onKeyUp.bind(this);
    this._onResize = this._onResize.bind(this);
    this._draw = this._draw.bind(this);
    this._dragMode = DRAG_MODE_IDLE;
    this._spaceDown = false;
    this._dragPort = null;
    this._networkX = this._networkY = 0;
    this._dragX = this._dragY = 0;
    this._timer = undefined;
  }

  componentDidMount() {
    window.addEventListener('keydown', this._onKeyDown);
    window.addEventListener('keyup', this._onKeyUp);
    window.addEventListener('resize', this._onResize);
    this.canvas = document.getElementById('network');
    this.ctx = this.canvas.getContext('2d');
    this._draw();
    this._timer = setInterval(this._draw, 1000);
  }

  componentWillUnmount() {
    window.removeEventListener('keydown', this._onKeyDown);
    window.removeEventListener('keyup', this._onKeyUp);
    window.removeEventListener('resize', this._onResize);
    clearInterval(this._timer);
  }

  render() {
    return (
      <div class="network">
        <canvas
          class="network__canvas"
          id="network"
          onMouseDown={this._onMouseDown}
          onMouseMove={this._onMouseMove}
          onDblClick={this._onDoubleClick}
          onContextMenu={e => e.preventDefault()}
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

  _findPort(node, x, y) {
    const dx = x - node.x;
    const dy = y - node.y;
    const portIndex = Math.floor(dx / NODE_PORT_WIDTH);
    if (this._dragMode === DRAG_MODE_DRAG_PORT) {
      return node.inPorts[portIndex];
    } else {
      if (dy <= 10) {
        return node.inPorts[portIndex];
      } else if (dy >= NODE_HEIGHT - 10) {
        return node.outPorts[portIndex];
      }
    }
  }

  _networkPosition(e) {
    const mouseX = e.offsetX;
    const mouseY = e.offsetY;
    const networkX = mouseX - this.state.x;
    const networkY = mouseY - this.state.y;
    return [networkX, networkY];
  }

  _onMouseDown(e) {
    e.preventDefault();
    if (e.button === 2 || e.button === 1 || this._spaceDown) {
      this._dragMode = DRAG_MODE_PANNING;
    } else if (e.button === 0) {
      this._dragMode = DRAG_MODE_SELECTING;
    } else {
      this._dragMode = DRAG_MODE_IDLE;
      return;
    }
    const mouseX = e.clientX;
    const mouseY = e.clientY - EDITOR_TABS_HEIGHT;
    this.prevX = mouseX;
    this.prevY = mouseY;
    if (this._dragMode === DRAG_MODE_SELECTING) {
      const [networkX, networkY] = this._networkPosition(e);
      const node = this._findNode(networkX, networkY);
      const port = node && this._findPort(node, networkX, networkY);
      if (port && port.direction === PORT_OUT) {
        this._dragMode = DRAG_MODE_DRAG_PORT;
        this._dragPort = port;
        const [x, y] = this._networkPosition(e);
        this._dragX = x;
        this._dragY = y;
      } else if (port && port.direction === PORT_IN) {
        const conn = this.props.network.connections.find(
          conn => conn.inNode === port.node.id && conn.inPort === port.name
        );
        if (conn) {
          this.props.onDisconnect(port);
          this._dragMode = DRAG_MODE_DRAG_PORT;
          const outNode = this.props.network.nodes.find(node => node.id === conn.outNode);
          const outPort = outNode.outPorts.find(port => port.name === conn.outPort);
          this._dragPort = outPort;
          const [x, y] = this._networkPosition(e);
          this._dragX = x;
          this._dragY = y;
        }
      } else if (node) {
        this._dragMode = DRAG_MODE_DRAG_NODE;
        this.props.onSelectNode(node);
        this._draw();
      } else {
        this.props.onClearSelection();
      }
    }
    window.addEventListener('mousemove', this._onMouseDrag);
    window.addEventListener('mouseup', this._onMouseUp);
  }

  _onMouseMove(e) {
    [this._networkX, this._networkY] = this._networkPosition(e);
    this._draw();
  }

  _onMouseDrag(e) {
    e.preventDefault();
    const mouseX = e.clientX;
    const mouseY = e.clientY - EDITOR_TABS_HEIGHT;
    const dx = mouseX - this.prevX;
    const dy = mouseY - this.prevY;
    [this._networkX, this._networkY] = this._networkPosition(e);
    if (this._dragMode === DRAG_MODE_PANNING) {
      this.setState({ x: this.state.x + dx, y: this.state.y + dy });
    } else if (this._dragMode === DRAG_MODE_SELECTING) {
      // FIXME implement box selections
    } else if (this._dragMode === DRAG_MODE_DRAG_NODE) {
      this.props.selection.forEach(node => {
        node.x += dx * this.state.scale;
        node.y += dy * this.state.scale;
      });
      this._draw();
    } else if (this._dragMode === DRAG_MODE_DRAG_PORT) {
      const [x, y] = this._networkPosition(e);
      this._dragX = x;
      this._dragY = y;
      this._draw();
    }
    this.prevX = mouseX;
    this.prevY = mouseY;
  }

  _onMouseUp(e) {
    e.preventDefault();
    if (this._dragMode === DRAG_MODE_DRAG_PORT) {
      const [networkX, networkY] = this._networkPosition(e);
      const node = this._findNode(networkX, networkY);
      const port = node && this._findPort(node, networkX, networkY);
      if (port && port.direction === PORT_IN) this.props.onConnect(this._dragPort, port);
    }
    window.removeEventListener('mousemove', this._onMouseDrag);
    window.removeEventListener('mouseup', this._onMouseUp);
    this._dragMode = DRAG_MODE_IDLE;
    this._draw();
  }

  _onDoubleClick(e) {
    const [networkX, networkY] = this._networkPosition(e);
    const node = this._findNode(networkX, networkY);
    if (node) {
      this.props.onNewCodeTab(node);
    } else {
      this.props.onShowNodeDialog(new Point(networkX, networkY));
    }
  }

  _onKeyDown(e) {
    if (e.keyCode === 32) {
      if (e.target.nodeName === 'INPUT' && e.target.type === 'text') return;
      e.preventDefault();
      this._spaceDown = true;
    }
  }

  _onKeyUp(e) {
    if (e.keyCode === 32) {
      if (e.target.nodeName === 'INPUT' && e.target.type === 'text') return;
      e.preventDefault();
      this._spaceDown = false;
    } else if (e.keyCode === 46 || e.keyCode === 8) {
      // Delete or backspace;
      if (e.target.localName === 'input' || e.target.localName === 'textarea') return;
      e.preventDefault();
      this.props.onDeleteSelection();
    }
  }

  _onResize() {
    this._draw();
  }

  _draw() {
    const { canvas, ctx } = this;
    const { network, selection } = this.props;

    const ratio = window.devicePixelRatio;
    const bounds = canvas.getBoundingClientRect();
    canvas.width = bounds.width * ratio;
    canvas.height = bounds.height * ratio;

    // Detect if we're hovering over a node.
    const overNode = this._findNode(this._networkX, this._networkY);
    const overPort = overNode
      ? this._findPort(overNode, this._networkX, this._networkY)
      : undefined;

    // Set up the canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.setTransform(ratio, 0.0, 0.0, ratio, this.state.x * ratio, this.state.y * ratio);

    // Draw nodes
    for (const node of network.nodes) {
      const nodeWidth = _nodeWidth(node);
      if (selection.has(node)) {
        ctx.fillStyle = COLORS.gray600;
        ctx.fillRect(node.x - 3, node.y - 3, nodeWidth + 6, NODE_HEIGHT + 6);
      }
      ctx.fillStyle = COLORS.gray700;
      ctx.fillRect(node.x, node.y, nodeWidth, NODE_HEIGHT);
      for (let i = 0; i < node.inPorts.length; i++) {
        const port = node.inPorts[i];
        ctx.fillStyle = PORT_COLORS[port.type];
        ctx.fillRect(node.x + i * NODE_PORT_WIDTH, node.y, NODE_PORT_WIDTH - 2, NODE_PORT_HEIGHT);
      }
      for (let i = 0; i < node.outPorts.length; i++) {
        const port = node.outPorts[i];
        ctx.fillStyle = PORT_COLORS[port.type];
        ctx.fillRect(
          node.x + i * NODE_PORT_WIDTH,
          node.y + NODE_HEIGHT - NODE_PORT_HEIGHT,
          NODE_PORT_WIDTH - 2,
          NODE_PORT_HEIGHT
        );
      }
    }

    // Draw node names
    ctx.fillStyle = COLORS.gray300;
    ctx.font = `12px ${FONT_FAMILY_MONO}`;
    for (const node of network.nodes) {
      const nodeWidth = _nodeWidth(node);
      ctx.fillText(node.name, node.x + nodeWidth + 10, node.y + NODE_PORT_WIDTH * 1.3);
    }

    // Draw node debug messages
    ctx.fillStyle = COLORS.gray600;
    ctx.font = `12px ${FONT_FAMILY_MONO}`;
    for (const node of network.nodes) {
      if (node.debugMessage) {
        const nodeWidth = _nodeWidth(node);
        ctx.fillText(node.debugMessage, node.x + nodeWidth + 10, node.y + NODE_HEIGHT + 10);
      }
    }

    // Draw node debug previews
    for (const node of network.nodes) {
      if (typeof node.debugDraw === 'function') {
        ctx.save();
        ctx.translate(node.x, node.y + NODE_HEIGHT + 10);
        node.debugDraw(ctx);
        ctx.restore();
      }
    }

    // Draw connections
    ctx.lineWidth = 2;
    for (const conn of network.connections) {
      const outNode = network.nodes.find(node => node.id === conn.outNode);
      const outPortIndex = outNode.outPorts.findIndex(port => port.name === conn.outPort);
      const inNode = network.nodes.find(node => node.id === conn.inNode);
      const inPortIndex = inNode.inPorts.findIndex(port => port.name === conn.inPort);
      const outPort = outNode.outPorts.find(port => port.name === conn.outPort);
      const outX = outNode.x + outPortIndex * NODE_PORT_WIDTH + NODE_PORT_WIDTH / 2;
      const outY = outNode.y + NODE_PORT_WIDTH * 2;
      const inX = inNode.x + inPortIndex * NODE_PORT_WIDTH + NODE_PORT_WIDTH / 2;
      const inY = inNode.y;
      ctx.strokeStyle = PORT_COLORS[outPort.type];
      this._drawConnectionLine(ctx, outX, outY, inX, inY);
    }

    this._drawPortTooltip(ctx, overNode, overPort);

    // Draw connection line when dragging
    if (this._dragMode === DRAG_MODE_DRAG_PORT) {
      ctx.strokeStyle = COLORS.gray300;
      const port = this._dragPort;
      const portIndex = port.node.outPorts.findIndex(p => p === this._dragPort);
      ctx.beginPath();
      let x1, y1, x2, y2;
      if (port.direction === PORT_OUT) {
        x1 = port.node.x + portIndex * NODE_PORT_WIDTH + NODE_PORT_WIDTH / 2;
        y1 = port.direction === PORT_IN ? port.node.y : port.node.y + NODE_PORT_WIDTH * 2;
        x2 = this._dragX;
        y2 = this._dragY;
      } else {
        x2 = port.node.x + portIndex * NODE_PORT_WIDTH + NODE_PORT_WIDTH / 2;
        y2 = port.direction === PORT_IN ? port.node.y : port.node.y + NODE_PORT_WIDTH * 2;
        x1 = this._dragX;
        y1 = this._dragY;
      }
      ctx.beginPath();
      this._drawConnectionLine(ctx, x1, y1, x2, y2);
      ctx.stroke();
    }
  }

  _drawPortTooltip(ctx, overNode, overPort) {
    if (!overPort) return;
    if (this._dragMode !== DRAG_MODE_IDLE && this._dragMode !== DRAG_MODE_DRAG_PORT) return;
    if (this._dragMode === DRAG_MODE_DRAG_PORT && overPort.direction !== PORT_IN) return;
    let toolTipX = overNode.x;
    let toolTipY = overNode.y;
    if (overPort.direction === PORT_IN) {
      const index = overNode.inPorts.indexOf(overPort);
      toolTipX += index * NODE_PORT_WIDTH;
      toolTipY += 25;
    } else {
      const index = overNode.outPorts.indexOf(overPort);
      toolTipX += index * NODE_PORT_WIDTH;
      toolTipY += NODE_HEIGHT + 20;
    }

    ctx.fillStyle = COLORS.gray500;
    ctx.fillRect(toolTipX, toolTipY, 10 + overPort.name.length * 8, 25);
    ctx.fillStyle = COLORS.gray900;
    ctx.fillText(overPort.name, toolTipX + 5, toolTipY + 17);
  }

  _drawConnectionLine(ctx, x1, y1, x2, y2) {
    const halfDy = Math.abs(y2 - y1) / 2.0;
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.bezierCurveTo(x1, y1 + halfDy, x2, y2 - halfDy, x2, y2);
    ctx.stroke();
  }
}
