import React, { useEffect, useRef, useState } from 'react';
import { COLORS } from '../colors';
import { Point } from '../g';
import * as figment from '../figment';
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
const DRAG_MODE_NEW_CONNECTION = 'new_connection'; // Dragging from output port to create new connection
const DRAG_MODE_RECONNECT = 'reconnect'; // Disconnected existing connection, re-dragging to reconnect
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

const PREVIEW_WGSL = `
struct Uniforms {
  viewport: vec2f,
  position: vec2f,
  camera: vec4f,
  resolution: vec2f,
  color: vec4f,
};

@group(0) @binding(0) var<uniform> u: Uniforms;
@group(0) @binding(1) var defaultSampler: sampler;
@group(0) @binding(2) var u_texture: texture_2d<f32>;

struct VertexOutput {
  @builtin(position) position: vec4f,
  @location(0) uv: vec2f,
};

@vertex
fn vs_main(@builtin(vertex_index) vi: u32) -> VertexOutput {
  var positions = array<vec2f, 6>(
    vec2f(0.0, 0.0), vec2f(0.0, ${NODE_HEIGHT}.0), vec2f(${NODE_WIDTH}.0, ${NODE_HEIGHT}.0),
    vec2f(0.0, 0.0), vec2f(${NODE_WIDTH}.0, ${NODE_HEIGHT}.0), vec2f(${NODE_WIDTH}.0, 0.0),
  );
  var uvs = array<vec2f, 6>(
    vec2f(0.0, 0.0), vec2f(0.0, 1.0), vec2f(1.0, 1.0),
    vec2f(0.0, 0.0), vec2f(1.0, 1.0), vec2f(1.0, 0.0),
  );

  var pos = positions[vi] / u.viewport;
  pos.x += u.position.x / u.viewport.x;
  pos.y += u.position.y / u.viewport.y;
  pos *= u.camera.z;
  pos.x += u.camera.x / u.viewport.x;
  pos.y += u.camera.y / u.viewport.y;
  pos.x = pos.x * 2.0 - 1.0;
  pos.y = (1.0 - pos.y) * 2.0 - 1.0;

  var out: VertexOutput;
  out.position = vec4f(pos, 0.0, 1.0);
  out.uv = uvs[vi];
  return out;
}

@fragment
fn fs_main(in: VertexOutput) -> @location(0) vec4f {
  let image_ratio = u.resolution.x / u.resolution.y;
  let box_width = ${PREVIEW_GEO_WIDTH}.0;
  let box_height = ${PREVIEW_GEO_HEIGHT}.0;
  let box_ratio = f32(${PREVIEW_GEO_RATIO});
  let delta_ratio = box_ratio / image_ratio;

  if (image_ratio > box_ratio) {
    let scale_factor = box_width / u.resolution.x;
    let height_diff = (box_height - u.resolution.y * scale_factor) / box_height;
    let half_height_diff = height_diff / 2.0;
    if (in.uv.y < half_height_diff || in.uv.y > 1.0 - half_height_diff) {
      return vec4f(0.0, 0.0, 0.0, 1.0);
    }
    let uv = vec2f(in.uv.x, (in.uv.y - half_height_diff) / delta_ratio);
    return u.color * textureSampleLevel(u_texture, defaultSampler, uv, 0.0);
  } else {
    let scale_factor = box_height / u.resolution.y;
    let width_diff = (box_width - u.resolution.x * scale_factor) / box_width;
    let half_width_diff = width_diff / 2.0;
    if (in.uv.x < half_width_diff || in.uv.x > 1.0 - half_width_diff) {
      return vec4f(0.0, 0.0, 0.0, 1.0);
    }
    let uv = vec2f((in.uv.x - half_width_diff) * delta_ratio, in.uv.y);
    return u.color * textureSampleLevel(u_texture, defaultSampler, uv, 0.0);
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

export default function NetworkEditor() {
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
  const dragStartXRef = useRef(0);
  const dragStartYRef = useRef(0);
  const shouldDrawRef = useRef(true);
  const canvasRef = useRef(null);
  const previewCanvasRef = useRef(null);
  const ctxRef = useRef(null);
  const previewGpuContextRef = useRef(null);
  const previewPipelineRef = useRef(null);
  const defaultTextureRef = useRef(null);
  const prevXRef = useRef(0);
  const prevYRef = useRef(0);
  const resizeObserverRef = useRef(null);
  const defaultTextureViewRef = useRef(null);
  const rafIdRef = useRef(0);

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

    // Set up WebGPU preview rendering
    const device = figment.getDevice();
    if (device && previewCanvasRef.current) {
      const gpuContext = previewCanvasRef.current.getContext('webgpu');
      const canvasFormat = navigator.gpu.getPreferredCanvasFormat();
      gpuContext.configure({
        device,
        format: canvasFormat,
        alphaMode: 'premultiplied',
      });
      previewGpuContextRef.current = gpuContext;

      // Build the preview pipeline with a custom vertex shader (not fullscreen triangle)
      const shaderModule = device.createShaderModule({ code: PREVIEW_WGSL, label: 'preview shader' });
      const uniformLayout = figment.computeUniformLayout({
        viewport: 'vec2f',
        position: 'vec2f',
        camera: 'vec4f',
        resolution: 'vec2f',
        color: 'vec4f',
      });

      const bindGroupLayout = device.createBindGroupLayout({
        entries: [
          { binding: 0, visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' } },
          { binding: 1, visibility: GPUShaderStage.FRAGMENT, sampler: { type: 'filtering' } },
          { binding: 2, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'float' } },
        ],
        label: 'preview bind group layout',
      });

      const pipelineLayout = device.createPipelineLayout({
        bindGroupLayouts: [bindGroupLayout],
        label: 'preview pipeline layout',
      });

      const pipeline = device.createRenderPipeline({
        layout: pipelineLayout,
        vertex: { module: shaderModule, entryPoint: 'vs_main' },
        fragment: {
          module: shaderModule,
          entryPoint: 'fs_main',
          targets: [
            {
              format: canvasFormat,
              blend: {
                color: { srcFactor: 'src-alpha', dstFactor: 'one-minus-src-alpha' },
                alpha: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha' },
              },
            },
          ],
        },
        primitive: { topology: 'triangle-list' },
        label: 'preview pipeline',
      });

      previewPipelineRef.current = { pipeline, bindGroupLayout, uniformLayout };

      // Create a 1x1 checkerboard default texture
      const defaultTex = device.createTexture({
        size: [2, 2],
        format: 'rgba8unorm',
        usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
        label: 'default checker',
      });
      device.queue.writeTexture(
        { texture: defaultTex },
        new Uint8Array([255, 255, 255, 255, 192, 192, 192, 255, 192, 192, 192, 255, 255, 255, 255, 255]),
        { bytesPerRow: 8 },
        [2, 2],
      );
      defaultTextureRef.current = defaultTex;
      defaultTextureViewRef.current = defaultTex.createView();
    }

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
      cancelAnimationFrame(rafIdRef.current);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('resize', onResize);
      currentNetwork.removeChangeListener(onNetworkChange);
      if (defaultTextureRef.current) defaultTextureRef.current.destroy();
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
    if (dragModeRef.current === DRAG_MODE_NEW_CONNECTION || dragModeRef.current === DRAG_MODE_RECONNECT) {
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
        dragModeRef.current = DRAG_MODE_NEW_CONNECTION;
        dragPortRef.current = port;
        const [x, y] = networkPosition(e);
        dragXRef.current = x;
        dragYRef.current = y;
        dragStartXRef.current = x;
        dragStartYRef.current = y;
      } else if (port && port.direction === PORT_IN) {
        const network = useAppStore.getState().network;
        const conn = network.connections.find((conn) => conn.inNode === port.node.id && conn.inPort === port.name);
        if (conn) {
          disconnect(port);
          dragModeRef.current = DRAG_MODE_RECONNECT;
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
          useAppStore.getState().pushSnapshot();
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
    } else if (dragModeRef.current === DRAG_MODE_NEW_CONNECTION || dragModeRef.current === DRAG_MODE_RECONNECT) {
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
    if (dragModeRef.current === DRAG_MODE_NEW_CONNECTION || dragModeRef.current === DRAG_MODE_RECONNECT) {
      const [networkX, networkY] = networkPosition(e);
      const node = findNode(networkX, networkY);
      const port = node && findPort(node, networkX, networkY);
      const sourceNode = dragPortRef.current.node;
      // Prevent connecting a node to itself
      if (node === sourceNode) {
        // Do nothing - can't connect to same node
      } else if (port && port.direction === PORT_IN) {
        connect(dragPortRef.current, port);
      } else if (!node && dragModeRef.current === DRAG_MODE_NEW_CONNECTION) {
        // Dragged to empty space from output port - open node dialog with pending connection
        // Only for new connections, not when reconnecting (disconnecting then re-dragging)
        // Require minimum drag distance of 20 screen pixels to avoid accidental triggers
        const dx = (networkX - dragStartXRef.current) * stateRef.current.scale;
        const dy = (networkY - dragStartYRef.current) * stateRef.current.scale;
        const dragDistance = Math.sqrt(dx * dx + dy * dy);
        if (dragDistance >= 20) {
          openNodeDialog(new Point(networkX, networkY), dragPortRef.current);
        }
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
    if (dragModeRef.current === DRAG_MODE_DRAG_NODE) {
      useAppStore.getState().setDirty(true);
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
    if (dragModeRef.current === DRAG_MODE_NEW_CONNECTION || dragModeRef.current === DRAG_MODE_RECONNECT) {
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
    const isDraggingConnection = dragModeRef.current === DRAG_MODE_NEW_CONNECTION || dragModeRef.current === DRAG_MODE_RECONNECT;
    if (dragModeRef.current !== DRAG_MODE_IDLE && !isDraggingConnection) return;
    if (isDraggingConnection && overPort.direction !== PORT_IN) return;
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
    const device = figment.getDevice();
    const previewCanvas = previewCanvasRef.current;
    const gpuContext = previewGpuContextRef.current;
    const pipelineInfo = previewPipelineRef.current;
    if (!device || !previewCanvas || !gpuContext || !pipelineInfo) return;

    const state = stateRef.current;
    const network = useAppStore.getState().network;
    const parent = previewCanvas.parentElement;
    if (previewCanvas.width !== parent.clientWidth || previewCanvas.height !== parent.clientHeight) {
      previewCanvas.width = parent.clientWidth;
      previewCanvas.height = parent.clientHeight;
    }

    const canvasTexture = gpuContext.getCurrentTexture();
    const canvasView = canvasTexture.createView();

    const encoder = device.createCommandEncoder({ label: 'preview encoder' });
    const pass = encoder.beginRenderPass({
      colorAttachments: [
        {
          view: canvasView,
          loadOp: 'clear',
          storeOp: 'store',
          clearValue: { r: 0.05, g: 0.06, b: 0.09, a: 1.0 },
        },
      ],
    });

    pass.setPipeline(pipelineInfo.pipeline);
    const uniformBuffers = [];

    for (const node of network.nodes) {
      const outPort = node.outPorts[0];
      if (!outPort || outPort.type !== 'image') {
        continue;
      }

      let nodeColor = [1, 0, 1, 1];
      let textureView, textureWidth, textureHeight;
      if (outPort.value && outPort.value.texture) {
        nodeColor = [1, 1, 1, 1];
        textureView = outPort.value.view;
        textureWidth = outPort.value.width;
        textureHeight = outPort.value.height;
      } else {
        textureView = defaultTextureViewRef.current;
        textureWidth = NODE_WIDTH;
        textureHeight = NODE_HEIGHT;
      }

      const uniformData = figment.packUniforms(pipelineInfo.uniformLayout, {
        viewport: [previewCanvas.width, previewCanvas.height],
        position: [node.x, node.y],
        camera: [state.x, state.y, state.scale, 0],
        resolution: [textureWidth, textureHeight],
        color: nodeColor,
      });

      const uniformBuffer = device.createBuffer({
        size: uniformData.byteLength,
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
      });
      device.queue.writeBuffer(uniformBuffer, 0, uniformData);
      uniformBuffers.push(uniformBuffer);

      const bindGroup = device.createBindGroup({
        layout: pipelineInfo.bindGroupLayout,
        entries: [
          { binding: 0, resource: { buffer: uniformBuffer } },
          { binding: 1, resource: figment.samplers.linearClamp },
          { binding: 2, resource: textureView },
        ],
      });

      pass.setBindGroup(0, bindGroup);
      pass.draw(6); // 2 triangles = 6 vertices
    }

    pass.end();
    device.queue.submit([encoder.finish()]);
    for (const buf of uniformBuffers) buf.destroy();
  };

  const animate = () => {
    if (shouldDrawRef.current) {
      drawNodePreviews();
      shouldDrawRef.current = false;
    }
    rafIdRef.current = window.requestAnimationFrame(animate);
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
