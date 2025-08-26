import React, { Component } from 'react';
import { COLORS } from '../colors';
import { Point } from '../g';
import * as figment from '../figment';

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
  PORT_TYPE_BOOLEAN,
  PORT_IN,
  PORT_OUT,
  PORT_DISPLAY_PLUG,
} from '../model/Port';

const FONT_FAMILY_MONO = `ui-monospace, Menlo, Monaco, "Cascadia Mono", "Segoe UI Mono", monospace`;

const NODE_PORT_WIDTH = 15;
const NODE_PORT_HEIGHT = 5;
const NODE_WIDTH = 100;
const NODE_HEIGHT = 56;
const NODE_RATIO = NODE_WIDTH / NODE_HEIGHT;
const NODE_BORDER = 1.5;
const EDITOR_TABS_HEIGHT = 30;
const NETWORK_HEADER_HEIGHT = 33;
const PREVIEW_GEO_WIDTH = NODE_WIDTH;
const PREVIEW_GEO_HEIGHT = NODE_HEIGHT;
const PREVIEW_GEO_RATIO = PREVIEW_GEO_WIDTH / PREVIEW_GEO_HEIGHT;

const DRAG_MODE_IDLE = 'idle';
const DRAG_MODE_PANNING = 'panning';
const DRAG_MODE_DRAG_NODE = 'drag_node';
const DRAG_MODE_DRAG_PORT = 'drag_port';
const DRAG_MODE_SELECTING = 'selecting';

const PORT_COLORS = {
  [PORT_TYPE_TRIGGER]: COLORS.yellow400,
  [PORT_TYPE_TOGGLE]: COLORS.gray100,
  [PORT_TYPE_NUMBER]: COLORS.gray500,
  [PORT_TYPE_STRING]: COLORS.indigo600,
  [PORT_TYPE_COLOR]: COLORS.gray600,
  [PORT_TYPE_POINT]: COLORS.gray700,
  [PORT_TYPE_FILE]: COLORS.gray400,
  [PORT_TYPE_IMAGE]: COLORS.green500,
  [PORT_TYPE_OBJECT]: COLORS.blue700,
  [PORT_TYPE_BOOLEAN]: COLORS.gray100,
};

// WebGPU-only migration: previews are drawn using 2D canvas from the source video/canvas when provided.

function clamp(v, min, max) {
  return Math.min(Math.max(v, min), max);
}

// function NODE_WIDTH {
//   let portCount = Math.max(node.inPorts.length, node.outPorts.length);
//   if (portCount < 6) return 100;
//   return portCount * NODE_PORT_WIDTH;
// }

export default class NetworkEditor extends Component {
  constructor(props) {
    super(props);
    this.state = { x: 0, y: 0, scale: 1.0 };
    this.MIN_VIEW_SCALE = 0.15;
    this.MAX_VIEW_SCALE = 15;
    this._onMouseDown = this._onMouseDown.bind(this);
    this._onMouseMove = this._onMouseMove.bind(this);
    this._onMouseDrag = this._onMouseDrag.bind(this);
    this._onMouseUp = this._onMouseUp.bind(this);
    this._onMouseWheel = this._onMouseWheel.bind(this);
    this._onDoubleClick = this._onDoubleClick.bind(this);
    this._onContextMenu = this._onContextMenu.bind(this);
    this._onKeyDown = this._onKeyDown.bind(this);
    this._onKeyUp = this._onKeyUp.bind(this);
    this._onResize = this._onResize.bind(this);
    this._onNetworkChange = this._onNetworkChange.bind(this);
    this._draw = this._draw.bind(this);
    this._drawNodePreviews = this._drawNodePreviews.bind(this);
    this._animate = this._animate.bind(this);
    this._dragMode = DRAG_MODE_IDLE;
    this._spaceDown = false;
    this._dragPort = null;
    this._networkX = this._networkY = 0;
    this._dragX = this._dragY = 0;
    this._timer = undefined;
    this._shouldDraw = true;
    this.canvasRef = React.createRef();
    this.previewCanvasRef = React.createRef();
    this._setupGPU = this._setupGPU.bind(this);
  }

  componentDidMount() {
    window.addEventListener('keydown', this._onKeyDown);
    window.addEventListener('keyup', this._onKeyUp);
    window.addEventListener('resize', this._onResize);
    this.canvas = this.canvasRef.current;
    this.ctx = this.canvas.getContext('2d');
    if (this.previewCanvasRef.current) {
      const parent = this.previewCanvasRef.current.parentElement;
      this.previewCanvasRef.current.width = parent.clientWidth;
      this.previewCanvasRef.current.height = parent.clientHeight;
      this._setupGPU();
    }

    // Add a resize observer, redrawing the canvas when the size changes
    this._resizeObserver = new ResizeObserver(this._onResize);
    if (this.canvasRef.current) {
      this._resizeObserver.observe(this.canvasRef.current);
    }

    this._draw();
    this.props.network.addChangeListener(this._onNetworkChange);
    this._animate();
  }

  componentWillUnmount() {
    window.removeEventListener('keydown', this._onKeyDown);
    window.removeEventListener('keyup', this._onKeyUp);
    window.removeEventListener('resize', this._onResize);
    clearInterval(this._timer);
    this.props.network.removeChangeListener(this._onNetworkChange);
    if (this.canvasRef.current) {
      this._resizeObserver.unobserve(this.canvasRef.current);
    }
  }

  render() {
    return (
      <div className="network relative">
        <canvas ref={this.previewCanvasRef} className="absolute inset-0 pointer-events-none" />
        <canvas
          className="network__canvas"
          ref={this.canvasRef}
          onMouseDown={this._onMouseDown}
          onMouseMove={this._onMouseMove}
          onDoubleClick={this._onDoubleClick}
          onWheel={this._onMouseWheel}
          onContextMenu={this._onContextMenu}
        />
      </div>
    );
  }

  componentDidUpdate(prevProps) {
    if (prevProps.network !== this.props.network) {
      prevProps.network.removeChangeListener(this._onNetworkChange);
      this.props.network.addChangeListener(this._onNetworkChange);
    }
    this._draw();
  }

  _hitTest(node, x, y) {
    const padding = 5 / this.state.scale;
    const x1 = node.x;
    const x2 = node.x + NODE_WIDTH;
    const y1 = node.y - padding; // Some slack for the input ports
    const y2 = node.y + NODE_HEIGHT + padding; // Some slack for the output ports
    return x >= x1 && x <= x2 && y >= y1 && y <= y2;
  }

  _findNode(x, y) {
    for (const node of this.props.network.nodes) {
      if (this._hitTest(node, x, y)) {
        return node;
      }
    }
  }

  _visibleInPorts(node) {
    return node.inPorts.filter((port) => port.display & PORT_DISPLAY_PLUG);
  }

  _visibleOutPorts(node) {
    return node.outPorts;
  }

  _findPort(node, x, y) {
    const dx = (x - node.x) * this.state.scale;
    const dy = (y - node.y) * this.state.scale;
    const portIndex = Math.floor(dx / NODE_PORT_WIDTH);
    if (this._dragMode === DRAG_MODE_DRAG_PORT) {
      return this._visibleInPorts(node)[portIndex];
    } else {
      if (dy <= 10) {
        return this._visibleInPorts(node)[portIndex];
      } else if (dy >= NODE_HEIGHT * this.state.scale - 10) {
        return this._visibleOutPorts(node)[portIndex];
      }
    }
  }

  _networkPosition(e) {
    const mouseX = e.clientX;
    const mouseY = e.clientY - NETWORK_HEADER_HEIGHT;
    const networkX = (mouseX - this.state.x) / this.state.scale;
    const networkY = (mouseY - this.state.y) / this.state.scale;
    return [networkX, networkY];
  }

  _coordsToView(x, y) {
    // return [(x + this.state.x) * this.state.scale, (y + this.state.y) * this.state.scale];
    return [this.state.x + x * this.state.scale, this.state.y + y * this.state.scale];
  }

  _onMouseDown(e) {
    if (e.button !== 0) {
      return;
    }
    e.preventDefault();
    // if (e.button === 0 && e.shiftKey) {
    //   this._dragMode = DRAG_MODE_SELECTING;
    // } else {
    //   this._dragMode = DRAG_MODE_IDLE;
    //   return;
    // }
    const mouseX = e.clientX;
    const mouseY = e.clientY - EDITOR_TABS_HEIGHT;
    this.prevX = mouseX;
    this.prevY = mouseY;
    const [networkX, networkY] = this._networkPosition(e);
    const node = this._findNode(networkX, networkY);
    if (!node) {
      if (e.shiftKey) {
        this._dragMode = DRAG_MODE_SELECTING;
        this._dragX = networkX;
        this._dragY = networkY;
      } else {
        this.props.onClearSelection();
        this._dragMode = DRAG_MODE_PANNING;
      }
    } else {
      // Mouse is over a node.
      const port = node && this._findPort(node, networkX, networkY);
      if (port && port.direction === PORT_OUT) {
        this._dragMode = DRAG_MODE_DRAG_PORT;
        this._dragPort = port;
        const [x, y] = this._networkPosition(e);
        this._dragX = x;
        this._dragY = y;
      } else if (port && port.direction === PORT_IN) {
        const conn = this.props.network.connections.find((conn) => conn.inNode === port.node.id && conn.inPort === port.name);
        if (conn) {
          this.props.onDisconnect(port);
          this._dragMode = DRAG_MODE_DRAG_PORT;
          const outNode = this.props.network.nodes.find((node) => node.id === conn.outNode);
          const outPort = outNode.outPorts.find((port) => port.name === conn.outPort);
          this._dragPort = outPort;
          const [x, y] = this._networkPosition(e);
          this._dragX = x;
          this._dragY = y;
        }
      } else {
        // Mouse is over a node, but not a port.
        if (e.shiftKey) {
          this.props.onToggleSelectNode(node);
          this._dragMode = DRAG_MODE_IDLE;
        } else {
          this._dragMode = DRAG_MODE_DRAG_NODE;
          if (!this.props.selection.has(node)) {
            this.props.onSelectNode(node);
          }
          this._draw();
        }
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
      this.props.selection.forEach((node) => {
        node.x += dx / this.state.scale;
        node.y += dy / this.state.scale;
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
    } else if (this._dragMode === DRAG_MODE_SELECTING) {
      // Find out which nodes are in the selection rectangle.
      const newSelection = new Set();
      for (const node of this.props.network.nodes) {
        if (node.x >= this._dragX && node.x <= this._networkX && node.y >= this._dragY && node.y <= this._networkY) {
          newSelection.add(node);
        }
      }
      this.props.onSelectNodes(newSelection);
    }
    window.removeEventListener('mousemove', this._onMouseDrag);
    window.removeEventListener('mouseup', this._onMouseUp);
    this._dragMode = DRAG_MODE_IDLE;
    this._draw();
  }

  _onMouseWheel(e) {
    // e.preventDefault();
    const [mouseX, mouseY] = this._networkPosition(e);
    const wheel = -e.deltaY;
    const zoom = Math.exp(wheel * 0.0005);
    let newScale = this.state.scale * zoom;
    if (newScale < this.MIN_VIEW_SCALE) {
      newScale = this.MIN_VIEW_SCALE;
    } else if (newScale > this.MAX_VIEW_SCALE) {
      newScale = this.MAX_VIEW_SCALE;
    }
    const scaleDelta = newScale - this.state.scale;
    this.setState({
      x: this.state.x - mouseX * scaleDelta,
      y: this.state.y - mouseY * scaleDelta,
      scale: newScale,
    });
  }

  _onDoubleClick(e) {
    const [networkX, networkY] = this._networkPosition(e);
    const node = this._findNode(networkX, networkY);
    if (!node) {
      this.props.onShowNodeDialog(new Point(networkX, networkY));
    }
  }

  _onContextMenu(e) {
    e.preventDefault();
    const [networkX, networkY] = this._networkPosition(e);
    const node = this._findNode(networkX, networkY);
    this._dragMode = DRAG_MODE_IDLE;
    if (node) {
      this.props.onSelectNode(node);
      window.desktop.showNodeContextMenu(node.id);
    } else {
      // FIXME: Show network context menu
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

  _onNetworkChange() {
    this._shouldDraw = true;
  }

  _draw() {
    const { canvas, ctx } = this;
    const { network, selection } = this.props;

    const ratio = window.devicePixelRatio;
    const bounds = canvas.getBoundingClientRect();
    if (canvas.width !== bounds.width * ratio || canvas.height !== bounds.height * ratio) {
      canvas.width = bounds.width * ratio;
      canvas.height = bounds.height * ratio;
    }

    // Detect if we're hovering over a node.
    const overNode = this._findNode(this._networkX, this._networkY);
    const overPort = overNode ? this._findPort(overNode, this._networkX, this._networkY) : undefined;

    // Set up the canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.setTransform(ratio, 0.0, 0.0, ratio, 0, 0);

    // Draw nodes
    for (const node of network.nodes) {
      const [nodeX, nodeY] = this._coordsToView(node.x, node.y);
      const nodeWidth = NODE_WIDTH * this.state.scale;
      const nodeHeight = NODE_HEIGHT * this.state.scale;
      let borderColor = COLORS.gray700;
      if (node.error) {
        borderColor = COLORS.red500;
      } else if (selection.has(node)) {
        borderColor = COLORS.blue600;
      }
      ctx.fillStyle = borderColor;

      ctx.fillRect(nodeX, nodeY, nodeWidth, NODE_BORDER);
      ctx.fillRect(nodeX, nodeY + nodeHeight - NODE_BORDER, nodeWidth, NODE_BORDER);
      ctx.fillRect(nodeX, nodeY, NODE_BORDER, nodeHeight);
      ctx.fillRect(nodeX + nodeWidth - NODE_BORDER, nodeY, NODE_BORDER, nodeHeight);

      // Draw port plugs
      let portX = 0;
      for (let i = 0; i < node.inPorts.length; i++) {
        const port = node.inPorts[i];
        if ((port.display & PORT_DISPLAY_PLUG) === 0) continue;
        ctx.fillStyle = PORT_COLORS[port.type];
        ctx.fillRect(nodeX + portX, nodeY - NODE_BORDER, NODE_PORT_WIDTH - 2, NODE_BORDER * 2);
        portX += NODE_PORT_WIDTH;
      }
      portX = 0;
      for (let i = 0; i < node.outPorts.length; i++) {
        const port = node.outPorts[i];
        ctx.fillStyle = PORT_COLORS[port.type];
        ctx.fillRect(nodeX + portX, nodeY + NODE_HEIGHT * this.state.scale - NODE_BORDER, NODE_PORT_WIDTH - 2, NODE_BORDER * 2);
        portX += NODE_PORT_WIDTH;
      }
    }

    // Draw node names
    ctx.fillStyle = COLORS.gray300;
    ctx.font = `12px ${FONT_FAMILY_MONO}`;
    for (const node of network.nodes) {
      const [textX, textY] = this._coordsToView(node.x + NODE_WIDTH, node.y + NODE_HEIGHT / 2);
      ctx.fillText(node.name, textX + 10, textY);
    }

    // Draw node output sizes
    if (this.state.scale > 0.5) {
      ctx.fillStyle = COLORS.gray700;
      ctx.font = `10px ${FONT_FAMILY_MONO}`;
      for (const node of network.nodes) {
        const [textX, textY] = this._coordsToView(node.x + NODE_WIDTH, node.y + NODE_HEIGHT / 2);

        if (node.debugMessage) {
          ctx.fillText(node.debugMessage, textX + 10, textY + 16);
        } else if (node.outPorts && node.outPorts.length > 0) {
          const outValue = node.outPorts[0].value;
          if (outValue && outValue.width && outValue.height) {
            ctx.fillText(`${outValue.width}x${outValue.height}`, textX + 10, textY + 16);
          }
        }
      }
    }

    // Draw connections
    ctx.lineWidth = 2;

    // Clip out the node previews so the lines appear below them.
    ctx.save();
    const clipPath = new Path2D();
    clipPath.rect(0, 0, canvas.width, canvas.height);
    for (const node of network.nodes) {
      let x = this.state.x + node.x * this.state.scale;
      let y = this.state.y + node.y * this.state.scale;
      clipPath.rect(x, y, NODE_WIDTH * this.state.scale, NODE_HEIGHT * this.state.scale);
    }
    ctx.clip(clipPath, 'evenodd');

    for (const conn of network.connections) {
      const outNode = network.nodes.find((node) => node.id === conn.outNode);
      const outPortIndex = this._visibleOutPorts(outNode).findIndex((port) => port.name === conn.outPort);
      const inNode = network.nodes.find((node) => node.id === conn.inNode);
      const inPortIndex = this._visibleInPorts(inNode).findIndex((port) => port.name === conn.inPort);
      const outPort = outNode.outPorts.find((port) => port.name === conn.outPort);
      const outX = this.state.x + outNode.x * this.state.scale + outPortIndex * NODE_PORT_WIDTH + NODE_PORT_WIDTH / 2;
      const outY = this.state.y + (outNode.y + NODE_HEIGHT) * this.state.scale;
      const inX = this.state.x + inNode.x * this.state.scale + inPortIndex * NODE_PORT_WIDTH + NODE_PORT_WIDTH / 2;
      const inY = this.state.y + inNode.y * this.state.scale;
      // const [outXScaled, outYScaled] = this._coordsToView(outX, outY);
      // const [inXScaled, inYScaled] = this._coordsToView(inX, inY);
      ctx.strokeStyle = PORT_COLORS[outPort.type];
      this._drawConnectionLine(ctx, outX, outY, inX, inY);
    }
    ctx.restore();

    this._drawPortTooltip(ctx, overNode, overPort);

    // Draw connection line when dragging
    if (this._dragMode === DRAG_MODE_DRAG_PORT) {
      ctx.strokeStyle = COLORS.gray300;
      const port = this._dragPort;
      const portIndex = port.node.outPorts.findIndex((p) => p === this._dragPort);
      ctx.beginPath();
      let x1, y1, x2, y2;
      if (port.direction === PORT_OUT) {
        x1 = this.state.x + port.node.x * this.state.scale + portIndex * NODE_PORT_WIDTH + NODE_PORT_WIDTH / 2;
        // y1 =
        //   this.state.y + port.direction === PORT_IN
        //     ? port.node.y * this.state.scale
        //     : (port.node.y + NODE_HEIGHT) * this.state.scale;
        y1 = this.state.y + (port.node.y + NODE_HEIGHT) * this.state.scale;
        x2 = this.state.x + this._dragX * this.state.scale;
        y2 = this.state.y + this._dragY * this.state.scale;
      } else {
        x2 = this.state.x + port.node.x * this.state.scale + portIndex * NODE_PORT_WIDTH + NODE_PORT_WIDTH / 2;
        y2 = this.state.y + port.direction === PORT_IN ? port.node.y * this.state.scale : (port.node.y + NODE_HEIGHT) * this.state.scale;
        x1 = this._dragX;
        y1 = this._dragY;
      }
      ctx.beginPath();
      this._drawConnectionLine(ctx, x1, y1, x2, y2);
      ctx.stroke();
    }

    // Draw drag rectangle
    if (this._dragMode === DRAG_MODE_SELECTING) {
      ctx.strokeStyle = COLORS.gray300;
      ctx.lineWidth = 1;
      let x1 = this._dragX;
      let y1 = this._dragY;
      let x2 = this._networkX - this._dragX;
      let y2 = this._networkY - this._dragY;
      ctx.beginPath();
      ctx.rect(this.state.scale * x1 + this.state.x, this.state.scale * y1 + this.state.y, this.state.scale * x2, this.state.scale * y2);
      ctx.stroke();
    }

    this._drawNodePreviews();
  }

  _drawPortTooltip(ctx, overNode, overPort) {
    if (!overPort) return;
    if (this._dragMode !== DRAG_MODE_IDLE && this._dragMode !== DRAG_MODE_DRAG_PORT) return;
    if (this._dragMode === DRAG_MODE_DRAG_PORT && overPort.direction !== PORT_IN) return;
    let toolTipX = this.state.x + overNode.x * this.state.scale;
    let toolTipY = this.state.y + overNode.y * this.state.scale;
    if (overPort.direction === PORT_IN) {
      const index = this._visibleInPorts(overNode).indexOf(overPort);
      toolTipX += index * NODE_PORT_WIDTH;
      toolTipY += 25;
    } else {
      const index = this._visibleOutPorts(overNode).indexOf(overPort);
      toolTipX += index * NODE_PORT_WIDTH;
      toolTipY += NODE_HEIGHT * this.state.scale + 20;
    }

    let text = overPort.name;
    if (overPort.type === PORT_TYPE_NUMBER) {
      text += ` [${overPort.value.toFixed(0)}]`;
    }

    ctx.fillStyle = COLORS.gray500;
    ctx.fillRect(toolTipX, toolTipY, 10 + text.length * 8, 25);
    ctx.fillStyle = COLORS.gray900;
    ctx.fillText(text, toolTipX + 5, toolTipY + 17);
  }

  _drawConnectionLine(ctx, x1, y1, x2, y2) {
    const halfDy = Math.abs(y2 - y1) / 2.0;
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.bezierCurveTo(x1, y1 + halfDy, x2, y2 - halfDy, x2, y2);
    ctx.stroke();
  }

  _drawNodePreviews() {
    const { network } = this.props;
    const canvas = this.previewCanvasRef.current;
    if (!canvas || !this._gpuCtx || !this._pipeline) return;
    const parent = canvas.parentElement;
    if (canvas.width !== parent.clientWidth || canvas.height !== parent.clientHeight) {
      canvas.width = parent.clientWidth;
      canvas.height = parent.clientHeight;
      // WebGPU context auto-adapts to canvas size; no reconfigure needed.
    }

    const device = window._gpu.device;
    if (!device) return;
    const encoder = device.createCommandEncoder();
    const pass = encoder.beginRenderPass({
      colorAttachments: [
        {
          view: this._gpuCtx.getCurrentTexture().createView(),
          loadOp: 'clear',
          storeOp: 'store',
          clearValue: { r: 0.05, g: 0.06, b: 0.09, a: 1.0 },
        },
      ],
    });

    pass.setPipeline(this._pipeline);

    for (const node of network.nodes) {
      const outPort = node.outPorts[0];
      if (!outPort || outPort.type !== 'image' || !outPort.value || !outPort.value.view) continue;
      const view = outPort.value.view;
      const texW = outPort.value.width || 1;
      const texH = outPort.value.height || 1;

      const dx = this.state.x + node.x * this.state.scale;
      const dy = this.state.y + node.y * this.state.scale;
      const dw = NODE_WIDTH * this.state.scale;
      const dh = NODE_HEIGHT * this.state.scale;

      // Scissor to the visible intersection of the node box and the canvas.
      const sx = Math.max(0, Math.floor(dx));
      const sy = Math.max(0, Math.floor(dy));
      const ex = Math.min(canvas.width, Math.ceil(dx + dw));
      const ey = Math.min(canvas.height, Math.ceil(dy + dh));
      const sw = Math.max(0, ex - sx);
      const sh = Math.max(0, ey - sy);
      if (sw === 0 || sh === 0) {
        continue; // nothing visible, skip draw for this node
      }
      pass.setScissorRect(sx, sy, sw, sh);

      // Pack uniforms (vec4f + vec2f) aligned -> 8 floats (32 bytes)
      const u = new Float32Array(8);
      u[0] = dx; // u_boxRect.x
      u[1] = dy; // u_boxRect.y
      u[2] = dw; // u_boxRect.w
      u[3] = dh; // u_boxRect.h
      u[4] = texW; // u_texSize.x
      u[5] = texH; // u_texSize.y
      // u[6], u[7] remain as padding
      const ubuf = device.createBuffer({ size: 32, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
      device.queue.writeBuffer(ubuf, 0, u.buffer, u.byteOffset, u.byteLength);

      const bindGroup = device.createBindGroup({
        layout: this._pipeline.getBindGroupLayout(0),
        entries: [
          { binding: 0, resource: { buffer: ubuf } },
          { binding: 1, resource: this._sampler },
          { binding: 2, resource: view },
        ],
      });

      pass.setBindGroup(0, bindGroup);
      pass.draw(3, 1, 0, 0);
    }

    pass.end();
    device.queue.submit([encoder.finish()]);
  }

  _setupGPU() {
    const canvas = this.previewCanvasRef.current;
    if (!canvas) return;
    this._gpuCtx = figment.initWebGPUCanvas(canvas);
    this._sampler = window._gpu.device.createSampler({ minFilter: 'linear', magFilter: 'linear' });
    const fragmentShaderSource = `
@fragment
fn fs_main(in: VertexOutput) -> @location(0) vec4f {
  // Compute pixel position from builtin fragment coordinates (pixels)
  let pos = in.position.xy;
  let box = u.boxRect; // x,y,w,h (pixels)
  let local = (pos - box.xy) / box.zw; // 0..1 inside the box
  // Letterbox sample preserving aspect ratio (no non-uniform branching on sampling)
  let texRatio = u.texSize.x / u.texSize.y;
  let boxRatio = box.z / box.w;
  var uvRemap: vec2f;
  if (texRatio > boxRatio) {
    // fit width, scale height
    let scale = boxRatio / texRatio;
    uvRemap = vec2f(local.x, (local.y - (1.0 - scale) * 0.5) / scale);
  } else {
    // fit height, scale width
    let scale = texRatio / boxRatio;
    uvRemap = vec2f((local.x - (1.0 - scale) * 0.5) / scale, local.y);
  }
  // Coverage mask inside [0,1]
  let in0 = step(0.0, uvRemap.x) * step(0.0, uvRemap.y);
  let in1 = step(uvRemap.x, 1.0) * step(uvRemap.y, 1.0);
  let mask = in0 * in1;
  let color = textureSample(u_input_texture, defaultSampler, clamp(uvRemap, vec2f(0.0), vec2f(1.0)));
  return mix(vec4f(0.0, 0.0, 0.0, 1.0), color, mask);
}
`;
    const fragmentShader = figment.makeFragmentShader(fragmentShaderSource, { uniformsSpec: { boxRect: 'vec4f', texSize: 'vec2f' }, textures: ['u_input_texture'] });
    this._pipeline = figment.createRenderPipeline({ fragmentShader, label: 'network.preview' });
  }

  _animate() {
    if (this._shouldDraw) {
      this._drawNodePreviews();
      this._shouldDraw = false;
    }
    window.requestAnimationFrame(this._animate);
  }
}
