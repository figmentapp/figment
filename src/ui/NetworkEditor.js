import { h, Component } from 'preact';
import { COLORS } from '../colors';
import { Point } from '../g';
import {
  PORT_TYPE_TRIGGER,
  PORT_TYPE_NUMBER,
  PORT_TYPE_COLOR,
  PORT_TYPE_POINT,
  PORT_IN,
  PORT_OUT
} from '../model/Port';

const FONT_FAMILY_MONO = `'SF Mono', Menlo, Consolas, Monaco, 'Liberation Mono', 'Lucida Console', monospace`;

const NODE_PORT_WIDTH = 15;
const NODE_PORT_HEIGHT = 5;
const NODE_HEIGHT = NODE_PORT_WIDTH * 2;
const EDITOR_TABS_HEIGHT = 30;

const DRAG_MODE_IDLE = 'idle';
const DRAG_MODE_PANNING = 'panning';
const DRAG_MODE_DRAG_NODE = 'drag_node';
const DRAG_MODE_DRAG_PORT = 'drag_port';
const DRAG_MODE_SELECTING = 'selecting';

const PORT_COLORS = {
  [PORT_TYPE_TRIGGER]: COLORS.yellow300,
  [PORT_TYPE_NUMBER]: COLORS.gray500,
  [PORT_TYPE_COLOR]: COLORS.gray600,
  [PORT_TYPE_POINT]: COLORS.gray700
};

function _nodeWidth(node) {
  let portCount = Math.max(node.inPorts.length, node.outPorts.length);
  portCount = Math.max(4, portCount);
  portCount++;
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
    this._onMouseUp = this._onMouseUp.bind(this);
    this._onDoubleClick = this._onDoubleClick.bind(this);
    this._onKeyDown = this._onKeyDown.bind(this);
    this._onKeyUp = this._onKeyUp.bind(this);
    this._onResize = this._onResize.bind(this);
    this._dragMode = DRAG_MODE_IDLE;
    this._spaceDown = false;
    this._dragPort = null;
    this._dragX = this._dragY = 0;
  }

  componentDidMount() {
    window.addEventListener('keydown', this._onKeyDown);
    window.addEventListener('keyup', this._onKeyUp);
    window.addEventListener('resize', this._onResize);
    this.canvas = document.getElementById('network');
    this.ctx = this.canvas.getContext('2d');
    this._draw();
  }

  componentWillUnmount() {
    window.removeEventListener('keydown', this._onKeyDown);
    window.removeEventListener('keyup', this._onKeyUp);
    window.removeEventListener('resize', this._onResize);
  }

  render() {
    return (
      <div class="network">
        <canvas
          class="network__canvas"
          id="network"
          onMouseDown={this._onMouseDown}
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
    if (dy <= 10) {
      return node.inPorts[portIndex];
    } else if (dy >= NODE_HEIGHT - 10) {
      return node.outPorts[portIndex];
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
      if (port) {
        this._dragMode = DRAG_MODE_DRAG_PORT;
        this._dragPort = port;
        const [x, y] = this._networkPosition(e);
        this._dragX = x;
        this._dragY = y;
      } else if (node) {
        this._dragMode = DRAG_MODE_DRAG_NODE;
        this.props.onSelectNode(node);
        this._draw();
      } else {
        this.props.onClearSelection();
      }
    }
    window.addEventListener('mousemove', this._onMouseMove);
    window.addEventListener('mouseup', this._onMouseUp);
  }

  _onMouseMove(e) {
    e.preventDefault();
    const mouseX = e.clientX;
    const mouseY = e.clientY - EDITOR_TABS_HEIGHT;
    const dx = mouseX - this.prevX;
    const dy = mouseY - this.prevY;
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
      if (port) this.props.onConnect(this._dragPort, port);
    }
    window.removeEventListener('mousemove', this._onMouseMove);
    window.removeEventListener('mouseup', this._onMouseUp);
    this._dragMode = DRAG_MODE_IDLE;
    this._draw();
  }

  _onDoubleClick(e) {
    const [networkX, networkY] = this._networkPosition(e);
    const node = this._findNode(networkX, networkY);
    if (node) {
      this.props.onOpenCode(node);
    } else {
      this.props.onShowNodeDialog(new Point(networkX, networkY));
    }
  }

  _onKeyDown(e) {
    if (e.keyCode === 32) {
      e.preventDefault();
      this._spaceDown = true;
    }
  }

  _onKeyUp(e) {
    if (e.keyCode === 32) {
      e.preventDefault();
      this._spaceDown = false;
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

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.setTransform(ratio, 0.0, 0.0, ratio, this.state.x * ratio, this.state.y * ratio);
    const nodeColors = [COLORS.gray400, COLORS.gray500, COLORS.gray600];
    for (const node of network.nodes) {
      const nodeWidth = _nodeWidth(node);
      if (selection.has(node)) {
        ctx.fillStyle = COLORS.gray600;
        ctx.fillRect(node.x - 3, node.y - 3, nodeWidth + 6, NODE_HEIGHT + 6);
      }
      ctx.fillStyle = COLORS.gray700;
      ctx.fillRect(node.x, node.y, nodeWidth, NODE_PORT_WIDTH * 2);
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
    ctx.fillStyle = COLORS.gray300;
    ctx.font = `12px ${FONT_FAMILY_MONO}`;
    for (const node of network.nodes) {
      const nodeWidth = _nodeWidth(node);
      ctx.fillText(node.name, node.x + nodeWidth + 10, node.y + NODE_PORT_WIDTH * 1.3);
    }
    //ctx.strokeStyle = COLORS.gray200;
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
    ctx.strokeStyle = COLORS.gray300;
    if (this._dragMode === DRAG_MODE_DRAG_PORT) {
      const port = this._dragPort;
      let portIndex;
      if (port.direction === PORT_IN) {
        portIndex = port.node.inPorts.findIndex(p => p === this._dragPort);
      } else {
        portIndex = port.node.outPorts.findIndex(p => p === this._dragPort);
      }
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

  _drawConnectionLine(ctx, x1, y1, x2, y2) {
    const halfDy = Math.abs(y2 - y1) / 2.0;
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.bezierCurveTo(x1, y1 + halfDy, x2, y2 - halfDy, x2, y2);
    ctx.stroke();
  }
}