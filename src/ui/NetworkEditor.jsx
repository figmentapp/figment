import React, { useEffect, useRef, useState } from 'react';
import { COLORS } from '../colors';
import { Point } from '../g';
import * as twgl from 'twgl.js';
import { useAppStore } from './store';

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
  // Convert position from 0.0-1.0 to -1.0-1.0
  pos.x = pos.x * 2.0 - 1.0;
  pos.y = (1.0 - pos.y) * 2.0 - 1.0;
  gl_Position = vec4(pos, 0.0, 1.0);
}
`;

const FRAGMENT_SHADER = `
precision mediump float;
uniform sampler2D u_texture;
uniform vec2 u_resolution;
uniform vec4 u_color;
varying vec2 v_uv;
void main() {
  // The ratio of the image (width / height)
  float image_ratio = u_resolution.x / u_resolution.y;
  // The ratio of the preview node box (width / height)
  float box_width = ${PREVIEW_GEO_WIDTH}.0;
  float box_height = ${PREVIEW_GEO_HEIGHT}.0;
  float box_ratio = ${PREVIEW_GEO_RATIO};
  float delta_ratio = box_ratio / image_ratio;
  if (image_ratio >  box_ratio) {
    // The image is wider than the box
    float scale_factor = box_width / u_resolution.x;
    float height_diff = (box_height - u_resolution.y * scale_factor) / box_height;
    float half_height_diff = height_diff / 2.0;
    if (v_uv.y < half_height_diff || v_uv.y > 1.0 - half_height_diff) {
      gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0);
    } else {
      vec2 uv = vec2(v_uv.x, (v_uv.y - half_height_diff) / delta_ratio);
      gl_FragColor = u_color * texture2D(u_texture, uv);
    }
  } else {
    // The image is taller than the box
    float scale_factor = box_height / u_resolution.y;
    float width_diff = (box_width - u_resolution.x * scale_factor) / box_width;
    float half_width_diff = width_diff / 2.0;
    if (v_uv.x < half_width_diff || v_uv.x > 1.0 - half_width_diff) {
      gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0);
    } else {
      vec2 uv = vec2((v_uv.x - half_width_diff) * delta_ratio, v_uv.y);
      gl_FragColor = u_color * texture2D(u_texture, uv);
    }
  }
}
`;

function clamp(v, min, max) {
  return Math.min(Math.max(v, min), max);
}

// function NODE_WIDTH {
//   let portCount = Math.max(node.inPorts.length, node.outPorts.length);
//   if (portCount < 6) return 100;
//   return portCount * NODE_PORT_WIDTH;
// }

export default function NetworkEditor({ offscreenCanvas }) {
  // In order to avoid stale closures, all data (network, selection) states are retrieved
  // from Zustand when needed. Action functions (e.g. selectNode) are stable in Zustand,
  // so it's safe to capture in closures.

  const selectNode = useAppStore((state) => state.selectNode);
  const toggleSelectNode = useAppStore((state) => state.toggleSelectNode);
  const selectNodes = useAppStore((state) => state.selectNodes);
  const clearSelection = useAppStore((state) => state.clearSelection);
  const deleteSelection = useAppStore((state) => state.deleteSelection);
  const openNodeDialog = useAppStore((state) => state.openNodeDialog);
  const connect = useAppStore((state) => state.connect);
  const disconnect = useAppStore((state) => state.disconnect);

  const MIN_VIEW_SCALE = 0.15;
  const MAX_VIEW_SCALE = 15;

  const stateRef = useRef({ x: 0, y: 0, scale: 1.0 });
  const [, forceUpdate] = useState({});

  const dragModeRef = useRef(DRAG_MODE_IDLE);
  const spaceDownRef = useRef(false);
  const dragPortRef = useRef(null);
  const networkXRef = useRef(0);
  const networkYRef = useRef(0);
  const dragXRef = useRef(0);
  const dragYRef = useRef(0);
  const shouldDrawRef = useRef(true);
  const canvasRef = useRef(null);
  const previewCanvasRef = useRef(null);
  const ctxRef = useRef(null);
  const glRef = useRef(null);
  const programInfoRef = useRef(null);
  const defaultTextureRef = useRef(null);
  const nodeRectBufferInfoRef = useRef(null);
  const offscreenCanvasRef = useRef(null);
  const prevXRef = useRef(0);
  const prevYRef = useRef(0);
  const resizeObserverRef = useRef(null);

  // On component mount
  useEffect(() => {
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('resize', onResize);

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    ctxRef.current = ctx;

    if (previewCanvasRef.current) {
      const parent = previewCanvasRef.current.parentElement;
      previewCanvasRef.current.width = parent.clientWidth;
      previewCanvasRef.current.height = parent.clientHeight;
    }

    offscreenCanvasRef.current = offscreenCanvas;
    const gl = offscreenCanvas.getContext('webgl');
    glRef.current = gl;
    programInfoRef.current = twgl.createProgramInfo(gl, [VERTEX_SHADER, FRAGMENT_SHADER]);

    // Create a default checkerboard texture.
    const checkerTexture = {
      mag: gl.NEAREST,
      min: gl.LINEAR,
      src: [255, 255, 255, 255, 192, 192, 192, 255, 192, 192, 192, 255, 255, 255, 255, 255],
    };
    defaultTextureRef.current = twgl.createTexture(gl, checkerTexture);

    // Create a buffer for a node rectangle.
    let x0 = 0;
    let x1 = NODE_WIDTH;
    let y0 = 0;
    let y1 = NODE_HEIGHT;
    const arrays = {
      a_position: { numComponents: 2, data: [x0, y0, x0, y1, x1, y1, x1, y0] },
      a_uv: { numComponents: 2, data: [0, 0, 0, 1, 1, 1, 1, 0] },
      indices: [0, 1, 2, 0, 2, 3],
    };
    nodeRectBufferInfoRef.current = twgl.createBufferInfoFromArrays(gl, arrays);

    // Add a resize observer, redrawing the canvas when the size changes
    resizeObserverRef.current = new ResizeObserver(onResize);
    if (canvasRef.current) {
      resizeObserverRef.current.observe(canvasRef.current);
    }

    draw();
    const initialNetwork = useAppStore.getState().network;
    initialNetwork.addChangeListener(onNetworkChange);
    animate();

    // Subscribe to store changes
    let currentNetwork = initialNetwork;
    const unsubscribe = useAppStore.subscribe((state, prevState) => {
      // Redraw on selection changes
      if (state.selection !== prevState.selection) {
        draw();
      }
      // Redraw on version changes (forceRedraw)
      if (state.version !== prevState.version) {
        draw();
      }
      // Update network listeners when network changes
      if (state.network !== prevState.network) {
        if (currentNetwork !== state.network) {
          currentNetwork.removeChangeListener(onNetworkChange);
          state.network.addChangeListener(onNetworkChange);
          currentNetwork = state.network;
        }
      }
    });

    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('resize', onResize);
      currentNetwork.removeChangeListener(onNetworkChange);
      if (canvasRef.current && resizeObserverRef.current) {
        resizeObserverRef.current.unobserve(canvasRef.current);
      }
      unsubscribe();
    };
  }, []);

  const hitTest = (node, x, y) => {
    const padding = 5 / stateRef.current.scale;
    const x1 = node.x;
    const x2 = node.x + NODE_WIDTH;
    const y1 = node.y - padding;
    const y2 = node.y + NODE_HEIGHT + padding;
    return x >= x1 && x <= x2 && y >= y1 && y <= y2;
  };

  const findNode = (x, y) => {
    const network = useAppStore.getState().network;
    for (const node of network.nodes) {
      if (hitTest(node, x, y)) {
        return node;
      }
    }
  };

  const visibleInPorts = (node) => {
    return node.inPorts.filter((port) => port.display & PORT_DISPLAY_PLUG);
  };

  const visibleOutPorts = (node) => {
    return node.outPorts;
  };

  const findPort = (node, x, y) => {
    const dx = (x - node.x) * stateRef.current.scale;
    const dy = (y - node.y) * stateRef.current.scale;
    const portIndex = Math.floor(dx / NODE_PORT_WIDTH);
    if (dragModeRef.current === DRAG_MODE_DRAG_PORT) {
      return visibleInPorts(node)[portIndex];
    } else {
      if (dy <= 10) {
        return visibleInPorts(node)[portIndex];
      } else if (dy >= NODE_HEIGHT * stateRef.current.scale - 10) {
        return visibleOutPorts(node)[portIndex];
      }
    }
  };

  const networkPosition = (e) => {
    const mouseX = e.clientX;
    const mouseY = e.clientY - NETWORK_HEADER_HEIGHT;
    const networkX = (mouseX - stateRef.current.x) / stateRef.current.scale;
    const networkY = (mouseY - stateRef.current.y) / stateRef.current.scale;
    return [networkX, networkY];
  };

  const coordsToView = (x, y) => {
    return [stateRef.current.x + x * stateRef.current.scale, stateRef.current.y + y * stateRef.current.scale];
  };

  const onMouseDown = (e) => {
    if (e.button !== 0) {
      return;
    }
    e.preventDefault();
    const mouseX = e.clientX;
    const mouseY = e.clientY - EDITOR_TABS_HEIGHT;
    prevXRef.current = mouseX;
    prevYRef.current = mouseY;
    const [networkX, networkY] = networkPosition(e);
    const node = findNode(networkX, networkY);
    if (!node) {
      if (e.shiftKey) {
        dragModeRef.current = DRAG_MODE_SELECTING;
        dragXRef.current = networkX;
        dragYRef.current = networkY;
      } else {
        clearSelection();
        dragModeRef.current = DRAG_MODE_PANNING;
      }
    } else {
      // Mouse is over a node.
      const port = node && findPort(node, networkX, networkY);
      if (port && port.direction === PORT_OUT) {
        dragModeRef.current = DRAG_MODE_DRAG_PORT;
        dragPortRef.current = port;
        const [x, y] = networkPosition(e);
        dragXRef.current = x;
        dragYRef.current = y;
      } else if (port && port.direction === PORT_IN) {
        const network = useAppStore.getState().network;
        const conn = network.connections.find((conn) => conn.inNode === port.node.id && conn.inPort === port.name);
        if (conn) {
          disconnect(port);
          dragModeRef.current = DRAG_MODE_DRAG_PORT;
          const outNode = network.nodes.find((node) => node.id === conn.outNode);
          const outPort = outNode.outPorts.find((port) => port.name === conn.outPort);
          dragPortRef.current = outPort;
          const [x, y] = networkPosition(e);
          dragXRef.current = x;
          dragYRef.current = y;
        }
      } else {
        // Mouse is over a node, but not a port.
        if (e.shiftKey) {
          toggleSelectNode(node);
          dragModeRef.current = DRAG_MODE_IDLE;
        } else {
          dragModeRef.current = DRAG_MODE_DRAG_NODE;
          const currentSelection = useAppStore.getState().selection;
          if (!currentSelection.has(node)) {
            selectNode(node);
          }
          draw();
        }
      }
    }
    window.addEventListener('mousemove', onMouseDrag);
    window.addEventListener('mouseup', onMouseUp);
  };

  const onMouseMove = (e) => {
    [networkXRef.current, networkYRef.current] = networkPosition(e);
    draw();
  };

  const onMouseDrag = (e) => {
    e.preventDefault();
    const mouseX = e.clientX;
    const mouseY = e.clientY - EDITOR_TABS_HEIGHT;
    const dx = mouseX - prevXRef.current;
    const dy = mouseY - prevYRef.current;
    [networkXRef.current, networkYRef.current] = networkPosition(e);
    if (dragModeRef.current === DRAG_MODE_PANNING) {
      stateRef.current.x += dx;
      stateRef.current.y += dy;
      draw();
    } else if (dragModeRef.current === DRAG_MODE_SELECTING) {
      // Box selections: nothing is needed here
    } else if (dragModeRef.current === DRAG_MODE_DRAG_NODE) {
      const currentSelection = useAppStore.getState().selection;
      currentSelection.forEach((node) => {
        node.x += dx / stateRef.current.scale;
        node.y += dy / stateRef.current.scale;
      });
      draw();
    } else if (dragModeRef.current === DRAG_MODE_DRAG_PORT) {
      const [x, y] = networkPosition(e);
      dragXRef.current = x;
      dragYRef.current = y;
      draw();
    }
    prevXRef.current = mouseX;
    prevYRef.current = mouseY;
  };

  const onMouseUp = (e) => {
    e.preventDefault();
    if (dragModeRef.current === DRAG_MODE_DRAG_PORT) {
      const [networkX, networkY] = networkPosition(e);
      const node = findNode(networkX, networkY);
      const port = node && findPort(node, networkX, networkY);
      if (port && port.direction === PORT_IN) {
        connect(dragPortRef.current, port);
      } else if (!node) {
        // Dragged to empty space - open node dialog with pending connection
        openNodeDialog(new Point(networkX, networkY), dragPortRef.current);
      }
    } else if (dragModeRef.current === DRAG_MODE_SELECTING) {
      // Find out which nodes are in the selection rectangle.
      const network = useAppStore.getState().network;
      const newSelection = new Set();
      for (const node of network.nodes) {
        if (node.x >= dragXRef.current && node.x <= networkXRef.current && node.y >= dragYRef.current && node.y <= networkYRef.current) {
          newSelection.add(node);
        }
      }
      selectNodes(newSelection);
    }
    window.removeEventListener('mousemove', onMouseDrag);
    window.removeEventListener('mouseup', onMouseUp);
    dragModeRef.current = DRAG_MODE_IDLE;
    draw();
  };

  const onMouseWheel = (e) => {
    const [mouseX, mouseY] = networkPosition(e);
    const wheel = -e.deltaY;
    const zoom = Math.exp(wheel * 0.0005);
    let newScale = stateRef.current.scale * zoom;
    if (newScale < MIN_VIEW_SCALE) {
      newScale = MIN_VIEW_SCALE;
    } else if (newScale > MAX_VIEW_SCALE) {
      newScale = MAX_VIEW_SCALE;
    }
    const scaleDelta = newScale - stateRef.current.scale;
    stateRef.current.x = stateRef.current.x - mouseX * scaleDelta;
    stateRef.current.y = stateRef.current.y - mouseY * scaleDelta;
    stateRef.current.scale = newScale;
    draw();
  };

  const onDoubleClick = (e) => {
    const [networkX, networkY] = networkPosition(e);
    const node = findNode(networkX, networkY);
    if (!node) {
      openNodeDialog(new Point(networkX, networkY));
    }
  };

  const onContextMenu = (e) => {
    e.preventDefault();
    const [networkX, networkY] = networkPosition(e);
    const node = findNode(networkX, networkY);
    dragModeRef.current = DRAG_MODE_IDLE;
    if (node) {
      selectNode(node);
      window.desktop.showNodeContextMenu(node.id);
    } else {
      // FIXME: Show network context menu
    }
  };

  const onKeyDown = (e) => {
    if (e.keyCode === 32) {
      if (e.target.nodeName === 'INPUT' && e.target.type === 'text') return;
      e.preventDefault();
      spaceDownRef.current = true;
    }
  };

  const onKeyUp = (e) => {
    if (e.keyCode === 32) {
      if (e.target.nodeName === 'INPUT' && e.target.type === 'text') return;
      e.preventDefault();
      spaceDownRef.current = false;
    } else if (e.keyCode === 46 || e.keyCode === 8) {
      // Delete or backspace;
      if (e.target.localName === 'input' || e.target.localName === 'textarea') return;
      e.preventDefault();
      deleteSelection();
      draw(); // Redraw immediately after deletion
    }
  };

  const onResize = () => {
    draw();
  };

  const onNetworkChange = () => {
    shouldDrawRef.current = true;
  };

  const draw = () => {
    const canvas = canvasRef.current;
    const ctx = ctxRef.current;
    if (!canvas || !ctx) return;

    const state = stateRef.current;
    const network = useAppStore.getState().network;
    const selection = useAppStore.getState().selection;
    const ratio = window.devicePixelRatio;
    const bounds = canvas.getBoundingClientRect();
    if (canvas.width !== bounds.width * ratio || canvas.height !== bounds.height * ratio) {
      canvas.width = bounds.width * ratio;
      canvas.height = bounds.height * ratio;
    }

    // Detect if we're hovering over a node.
    const overNode = findNode(networkXRef.current, networkYRef.current);
    const overPort = overNode ? findPort(overNode, networkXRef.current, networkYRef.current) : undefined;

    // Set up the canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.setTransform(ratio, 0.0, 0.0, ratio, 0, 0);

    // Draw nodes
    for (const node of network.nodes) {
      const [nodeX, nodeY] = coordsToView(node.x, node.y);
      const nodeWidth = NODE_WIDTH * state.scale;
      const nodeHeight = NODE_HEIGHT * state.scale;
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
        ctx.fillRect(nodeX + portX, nodeY + NODE_HEIGHT * state.scale - NODE_BORDER, NODE_PORT_WIDTH - 2, NODE_BORDER * 2);
        portX += NODE_PORT_WIDTH;
      }
    }

    // Draw node names
    ctx.fillStyle = COLORS.gray300;
    ctx.font = `12px ${FONT_FAMILY_MONO}`;
    for (const node of network.nodes) {
      const [textX, textY] = coordsToView(node.x + NODE_WIDTH, node.y + NODE_HEIGHT / 2);
      ctx.fillText(node.name, textX + 10, textY);
    }

    // Draw node output sizes
    if (state.scale > 0.5) {
      ctx.fillStyle = COLORS.gray700;
      ctx.font = `10px ${FONT_FAMILY_MONO}`;
      for (const node of network.nodes) {
        const [textX, textY] = coordsToView(node.x + NODE_WIDTH, node.y + NODE_HEIGHT / 2);

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
      let x = state.x + node.x * state.scale;
      let y = state.y + node.y * state.scale;
      clipPath.rect(x, y, NODE_WIDTH * state.scale, NODE_HEIGHT * state.scale);
    }
    ctx.clip(clipPath, 'evenodd');

    for (const conn of network.connections) {
      const outNode = network.nodes.find((node) => node.id === conn.outNode);
      const outPortIndex = visibleOutPorts(outNode).findIndex((port) => port.name === conn.outPort);
      const inNode = network.nodes.find((node) => node.id === conn.inNode);
      const inPortIndex = visibleInPorts(inNode).findIndex((port) => port.name === conn.inPort);
      const outPort = outNode.outPorts.find((port) => port.name === conn.outPort);
      const outX = state.x + outNode.x * state.scale + outPortIndex * NODE_PORT_WIDTH + NODE_PORT_WIDTH / 2;
      const outY = state.y + (outNode.y + NODE_HEIGHT) * state.scale;
      const inX = state.x + inNode.x * state.scale + inPortIndex * NODE_PORT_WIDTH + NODE_PORT_WIDTH / 2;
      const inY = state.y + inNode.y * state.scale;
      ctx.strokeStyle = PORT_COLORS[outPort.type];
      drawConnectionLine(ctx, outX, outY, inX, inY);
    }
    ctx.restore();

    drawPortTooltip(ctx, overNode, overPort);

    // Draw connection line when dragging
    if (dragModeRef.current === DRAG_MODE_DRAG_PORT) {
      ctx.strokeStyle = COLORS.gray300;
      const port = dragPortRef.current;
      const portIndex = port.node.outPorts.findIndex((p) => p === dragPortRef.current);
      ctx.beginPath();
      let x1, y1, x2, y2;
      if (port.direction === PORT_OUT) {
        x1 = state.x + port.node.x * state.scale + portIndex * NODE_PORT_WIDTH + NODE_PORT_WIDTH / 2;
        y1 = state.y + (port.node.y + NODE_HEIGHT) * state.scale;
        x2 = state.x + dragXRef.current * state.scale;
        y2 = state.y + dragYRef.current * state.scale;
      } else {
        x2 = state.x + port.node.x * state.scale + portIndex * NODE_PORT_WIDTH + NODE_PORT_WIDTH / 2;
        y2 = state.y + port.direction === PORT_IN ? port.node.y * state.scale : (port.node.y + NODE_HEIGHT) * state.scale;
        x1 = dragXRef.current;
        y1 = dragYRef.current;
      }
      ctx.beginPath();
      drawConnectionLine(ctx, x1, y1, x2, y2);
      ctx.stroke();
    }

    // Draw drag rectangle
    if (dragModeRef.current === DRAG_MODE_SELECTING) {
      ctx.strokeStyle = COLORS.gray300;
      ctx.lineWidth = 1;
      let x1 = dragXRef.current;
      let y1 = dragYRef.current;
      let x2 = networkXRef.current - dragXRef.current;
      let y2 = networkYRef.current - dragYRef.current;
      ctx.beginPath();
      ctx.rect(state.scale * x1 + state.x, state.scale * y1 + state.y, state.scale * x2, state.scale * y2);
      ctx.stroke();
    }

    drawNodePreviews();
  };

  const drawPortTooltip = (ctx, overNode, overPort) => {
    if (!overPort) return;
    if (dragModeRef.current !== DRAG_MODE_IDLE && dragModeRef.current !== DRAG_MODE_DRAG_PORT) return;
    if (dragModeRef.current === DRAG_MODE_DRAG_PORT && overPort.direction !== PORT_IN) return;
    const state = stateRef.current;
    let toolTipX = state.x + overNode.x * state.scale;
    let toolTipY = state.y + overNode.y * state.scale;
    if (overPort.direction === PORT_IN) {
      const index = visibleInPorts(overNode).indexOf(overPort);
      toolTipX += index * NODE_PORT_WIDTH;
      toolTipY += 25;
    } else {
      const index = visibleOutPorts(overNode).indexOf(overPort);
      toolTipX += index * NODE_PORT_WIDTH;
      toolTipY += NODE_HEIGHT * state.scale + 20;
    }

    let text = overPort.name;
    if (overPort.type === PORT_TYPE_NUMBER) {
      text += ` [${overPort.value.toFixed(0)}]`;
    }

    ctx.fillStyle = COLORS.gray500;
    ctx.fillRect(toolTipX, toolTipY, 10 + text.length * 8, 25);
    ctx.fillStyle = COLORS.gray900;
    ctx.fillText(text, toolTipX + 5, toolTipY + 17);
  };

  const drawConnectionLine = (ctx, x1, y1, x2, y2) => {
    const halfDy = Math.abs(y2 - y1) / 2.0;
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.bezierCurveTo(x1, y1 + halfDy, x2, y2 - halfDy, x2, y2);
    ctx.stroke();
  };

  const drawNodePreviews = () => {
    const gl = glRef.current;
    const canvas = offscreenCanvasRef.current;
    const previewCanvas = previewCanvasRef.current;
    if (!gl || !canvas || !previewCanvas) return;

    const state = stateRef.current;
    const network = useAppStore.getState().network;
    const parent = previewCanvas.parentElement;
    if (canvas.width !== parent.clientWidth || canvas.height !== parent.clientHeight) {
      canvas.width = parent.clientWidth;
      canvas.height = parent.clientHeight;
      previewCanvas.width = parent.clientWidth;
      previewCanvas.height = parent.clientHeight;
    }
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.clearColor(0.05, 0.06, 0.09, 1.0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

    for (const node of network.nodes) {
      const outPort = node.outPorts[0];
      if (!outPort || outPort.type !== 'image') {
        continue;
      }

      let nodeColor = [1, 0, 1, 1];
      let texture, textureWidth, textureHeight;
      if (outPort.value && outPort.value._fbo) {
        nodeColor = [1, 1, 1, 1];
        texture = outPort.value._fbo.attachments[0];
        textureWidth = outPort.value.width;
        textureHeight = outPort.value.height;
      } else {
        texture = defaultTextureRef.current;
        textureWidth = NODE_WIDTH;
        textureHeight = NODE_HEIGHT;
      }

      twgl.bindFramebufferInfo(gl, null);
      gl.useProgram(programInfoRef.current.program);
      twgl.setBuffersAndAttributes(gl, programInfoRef.current, nodeRectBufferInfoRef.current);
      twgl.setUniforms(programInfoRef.current, {
        u_texture: texture,
        u_color: nodeColor,
        u_viewport: [canvas.width, canvas.height],
        u_position: [node.x, node.y],
        u_resolution: [textureWidth, textureHeight],
        u_camera: [state.x, state.y, state.scale],
      });
      twgl.drawBufferInfo(gl, nodeRectBufferInfoRef.current);
    }

    const previewContext = previewCanvas.getContext('bitmaprenderer');
    const bitmap = canvas.transferToImageBitmap();
    previewContext.transferFromImageBitmap(bitmap);
  };

  const animate = () => {
    if (shouldDrawRef.current) {
      drawNodePreviews();
      shouldDrawRef.current = false;
    }
    window.requestAnimationFrame(animate);
  };

  return (
    <div className="network relative">
      <canvas ref={previewCanvasRef} className="absolute inset-0 pointer-events-none" />
      <canvas
        className="network__canvas"
        ref={canvasRef}
        onMouseDown={onMouseDown}
        onMouseMove={onMouseMove}
        onDoubleClick={onDoubleClick}
        onWheel={onMouseWheel}
        onContextMenu={onContextMenu}
      />
    </div>
  );
}
