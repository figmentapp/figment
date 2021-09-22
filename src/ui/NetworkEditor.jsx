import React, { Component } from 'react';
import { COLORS } from '../colors';
import { Point } from '../g';
import * as twgl from 'twgl.js';
import { v3, m4 } from 'twgl.js';

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
  PORT_OUT,
} from '../model/Port';

const FONT_FAMILY_MONO = `'SF Mono', Menlo, Consolas, Monaco, 'Liberation Mono', 'Lucida Console', monospace`;

const NODE_PORT_WIDTH = 15;
const NODE_PORT_HEIGHT = 5;
const NODE_WIDTH = 100;
const NODE_HEIGHT = 56;
const NODE_RATIO = NODE_WIDTH / NODE_HEIGHT;
const NODE_BORDER = 4;
const EDITOR_TABS_HEIGHT = 30;
const NETWORK_HEADER_HEIGHT = 33;
const PREVIEW_GEO_WIDTH = NODE_WIDTH - NODE_BORDER * 2;
const PREVIEW_GEO_HEIGHT = NODE_HEIGHT - NODE_BORDER * 2;
const PREVIEW_GEO_RATIO = PREVIEW_GEO_WIDTH / PREVIEW_GEO_HEIGHT;

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
  [PORT_TYPE_OBJECT]: COLORS.gray800,
};

const VERTEX_SHADER = `
uniform vec2 u_viewport;
uniform vec2 u_position;
uniform vec3 u_camera;
attribute vec2 a_position;
attribute vec2 a_uv;
varying vec2 v_uv;
void main() {
  v_uv = a_uv;
  vec2 pos = a_position / u_viewport;
  pos.x += u_position.x / u_viewport.x;
  pos.y += u_position.y / u_viewport.y;
  pos.x *= u_camera.z;
  pos.y *= u_camera.z;
  pos.x += u_camera.x / u_viewport.x;
  pos.y += u_camera.y / u_viewport.y;
  // pos.y = 1.0 - pos.y;
  // Convert position from 0.0-1.0 to -1.0-1.0
  pos.x = pos.x * 2.0 - 1.0;
  pos.y = (1.0 - pos.y) * 2.0 - 1.0;
  gl_Position = vec4(pos, 0.0, 1.0);
}
`;

const FRAGMENT_SHADER = `
precision mediump float;
uniform sampler2D u_texture;
uniform vec4 u_color;
varying vec2 v_uv;
void main() {
  gl_FragColor = u_color * texture2D(u_texture, v_uv);
}
`;

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
    this._onMouseWheel = this._onMouseWheel.bind(this);
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
    this.canvasRef = React.createRef();
    this.previewCanvasRef = React.createRef();
  }

  componentDidMount() {
    window.addEventListener('keydown', this._onKeyDown);
    window.addEventListener('keyup', this._onKeyUp);
    window.addEventListener('resize', this._onResize);
    this.canvas = this.canvasRef.current;
    this.ctx = this.canvas.getContext('2d');
    this._timer = setInterval(this._draw, 1000);
    this.gl = twgl.getWebGLContext(this.previewCanvasRef.current);
    window.gl = this.gl;
    this.programInfo = twgl.createProgramInfo(this.gl, [VERTEX_SHADER, FRAGMENT_SHADER]);
    this.bufferInfoMap = {};

    // this.scene = new THREE.Scene();
    // this.camera = new THREE.OrthographicCamera(0, 1, 1, 0, -1, 1);
    // this.planeGeometry = new THREE.PlaneBufferGeometry(PREVIEW_GEO_WIDTH, PREVIEW_GEO_HEIGHT);
    // this.nodeGroup = new THREE.Group();
    // this.scene.add(this.nodeGroup);
    // this.meshMap = {};

    this._draw();
  }

  componentWillUnmount() {
    window.removeEventListener('keydown', this._onKeyDown);
    window.removeEventListener('keyup', this._onKeyUp);
    window.removeEventListener('resize', this._onResize);
    clearInterval(this._timer);
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
          onContextMenu={(e) => e.preventDefault()}
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
    const mouseX = e.clientX;
    const mouseY = e.clientY - NETWORK_HEADER_HEIGHT;
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
          (conn) => conn.inNode === port.node.id && conn.inPort === port.name
        );
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
      this.props.selection.forEach((node) => {
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

  _onMouseWheel(e) {
    // e.preventDefault();
    const delta = e.deltaY;
    const scale = this.state.scale;
    const newScale = scale - (delta / 1000) * scale;
    this.setState({ scale: newScale });
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
    const overPort = overNode ? this._findPort(overNode, this._networkX, this._networkY) : undefined;

    // Set up the canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.setTransform(ratio, 0.0, 0.0, ratio, this.state.x * ratio, this.state.y * ratio);
    // -    ctx.setTransform(ratio, 0.0, 0.0, ratio, this.state.x * ratio, this.state.y * ratio);
    ctx.setTransform(
      ratio * this.state.scale,
      0.0,
      0.0,
      ratio * this.state.scale,
      this.state.x * ratio,
      this.state.y * ratio
    );

    // Draw nodes
    for (const node of network.nodes) {
      const nodeWidth = _nodeWidth(node);
      if (selection.has(node)) {
        ctx.fillStyle = COLORS.blue600;
        // ctx.fillRect(node.x - 3, node.y - 3, nodeWidth + 6, NODE_HEIGHT + 6);
      } else {
        ctx.fillStyle = COLORS.gray700;
      }
      ctx.fillRect(node.x, node.y, nodeWidth, NODE_BORDER);
      ctx.fillRect(node.x, node.y + NODE_HEIGHT - NODE_BORDER, nodeWidth, NODE_BORDER);
      ctx.fillRect(node.x, node.y, NODE_BORDER, NODE_HEIGHT);
      ctx.fillRect(node.x + nodeWidth - NODE_BORDER, node.y, NODE_BORDER, NODE_HEIGHT);

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
      this._drawNodePreviews();
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
        ctx.translate(node.x + 18, node.y + NODE_HEIGHT + 10);
        node.debugDraw(ctx);
        ctx.restore();
      }
    }

    // Draw connections
    ctx.lineWidth = 2;
    for (const conn of network.connections) {
      const outNode = network.nodes.find((node) => node.id === conn.outNode);
      const outPortIndex = outNode.outPorts.findIndex((port) => port.name === conn.outPort);
      const inNode = network.nodes.find((node) => node.id === conn.inNode);
      const inPortIndex = inNode.inPorts.findIndex((port) => port.name === conn.inPort);
      const outPort = outNode.outPorts.find((port) => port.name === conn.outPort);
      const outX = outNode.x + outPortIndex * NODE_PORT_WIDTH + NODE_PORT_WIDTH / 2;
      const outY = outNode.y + NODE_HEIGHT;
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
      const portIndex = port.node.outPorts.findIndex((p) => p === this._dragPort);
      ctx.beginPath();
      let x1, y1, x2, y2;
      if (port.direction === PORT_OUT) {
        x1 = port.node.x + portIndex * NODE_PORT_WIDTH + NODE_PORT_WIDTH / 2;
        y1 = port.direction === PORT_IN ? port.node.y : port.node.y + NODE_HEIGHT;
        x2 = this._dragX;
        y2 = this._dragY;
      } else {
        x2 = port.node.x + portIndex * NODE_PORT_WIDTH + NODE_PORT_WIDTH / 2;
        y2 = port.direction === PORT_IN ? port.node.y : port.node.y + NODE_HEIGHT;
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
    const { gl } = this;
    const { network } = this.props;
    const canvas = this.previewCanvasRef.current;
    const parent = canvas.parentElement;
    canvas.width = parent.clientWidth;
    canvas.height = parent.clientHeight;
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.clearColor(0.05, 0.06, 0.09, 1.0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    // this.renderer.setSize(canvas.width, canvas.height);
    // this.renderer.setViewport(0, 0, canvas.width, canvas.height);
    // this.renderer.setClearColor(0x22272e);
    // this.renderer.clear();
    // this.camera.right = canvas.width;
    // this.camera.top = canvas.height;
    // this.camera.updateProjectionMatrix();
    // return;

    for (const node of network.nodes) {
      const outPort = node.outPorts[0];
      if (outPort.type !== 'image') {
        this.ctx.fillStyle = 'red';
        this.ctx.fillRect(
          node.x + NODE_BORDER,
          node.y + NODE_BORDER,
          NODE_WIDTH - NODE_BORDER * 2,
          NODE_HEIGHT - NODE_BORDER * 2
        );
      }
      if (!this.bufferInfoMap[node.id]) {
        let x0 = 0;
        let x1 = NODE_WIDTH;
        let y0 = 0;
        let y1 = NODE_HEIGHT;
        const arrays = {
          // a_position: [-1, -1, 0, 1, -1, 0, -1, 1, 0, -1, 1, 0, 1, -1, 0, 1, 1, 0],
          a_position: [x0, y0, 0, x1, y0, 0, x0, y1, 0, x0, y1, 0, x1, y0, 0, x1, y1, 0],
          a_uv: [0, 0, 1, 0, 0, 1, 0, 1, 1, 0, 1, 1, 0, 0, 0, 1, 1, 1, 1, 1, 1],
        };
        const bufferInfo = twgl.createBufferInfoFromArrays(gl, arrays);
        this.bufferInfoMap[node.id] = bufferInfo;
        // const material = new THREE.MeshBasicMaterial({ color: 0xff00ff });
        // const mesh = new THREE.Mesh(this.planeGeometry, material);
        // this.nodeGroup.add(mesh);
        // this.meshMap[node.id] = mesh;
      }
      // this.nodeGroup.position.set(this.state.x, -this.state.y, 0);

      let nodeColor = [1, 0, 1, 1];
      // const mesh = this.bufferInfoMap[node.id];
      // mesh.position.set(node.x + NODE_WIDTH / 2, canvas.height - node.y - NODE_HEIGHT / 2, 0);
      let texture = null;
      if (outPort.value && outPort.value._fbo) {
        nodeColor = [1, 1, 1, 1];
        texture = outPort.value._fbo.attachments[0];
      }
      //   let ratio = outPort.value.width / outPort.value.height;
      //   let dRatio = PREVIEW_GEO_RATIO / ratio;
      //   if (ratio < PREVIEW_GEO_RATIO) {
      //     mesh.scale.set(1 / dRatio, 1, 1);
      //   } else {
      //     mesh.scale.set(1, dRatio, 1);
      //   }
      //   mesh.material.color.set(0xffffff);
      //   mesh.material.map = outPort.value.texture;
      //   mesh.material.needsUpdate = true;
      // } else {
      //   mesh.material.color.set(0xff00ff);
      //   mesh.material.map = null;
      // }

      gl.useProgram(this.programInfo.program);
      twgl.setBuffersAndAttributes(gl, this.programInfo, this.bufferInfoMap[node.id]);
      twgl.setUniforms(this.programInfo, {
        u_texture: texture,
        u_color: nodeColor,
        u_viewport: [canvas.width, canvas.height],
        u_position: [node.x, node.y],
        u_camera: [this.state.x, this.state.y, this.state.scale],
      });
      twgl.drawBufferInfo(gl, this.bufferInfoMap[node.id]);
    }

    // for (const nodeId of Object.keys(this.meshMap)) {
    //   const id = parseInt(nodeId);
    //   if (!network.nodes.find((n) => n.id === id)) {
    //     this.nodeGroup.remove(this.meshMap[nodeId]);
    //     delete this.meshMap[nodeId];
    //   }
    // }

    // this.renderer.render(this.scene, this.camera);
  }
}
