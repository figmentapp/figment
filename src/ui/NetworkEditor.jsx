import React, { useState, useEffect, useRef } from 'react';
import { COLORS } from '../colors';
import { Point } from '../g';
import * as twgl from 'twgl.js';

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
  [PORT_TYPE_TOGGLE]: COLORS.orange300,
  [PORT_TYPE_NUMBER]: COLORS.gray500,
  [PORT_TYPE_STRING]: COLORS.indigo600,
  [PORT_TYPE_COLOR]: COLORS.gray600,
  [PORT_TYPE_POINT]: COLORS.gray700,
  [PORT_TYPE_FILE]: COLORS.gray400,
  [PORT_TYPE_IMAGE]: COLORS.green500,
  [PORT_TYPE_OBJECT]: COLORS.gray800,
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

const NetworkEditor = ({ network, selection, offscreenCanvas, onSelectNode, onToggleSelectNode, onSelectNodes, onClearSelection, onDeleteSelection, onShowNodeDialog, onConnect, onDisconnect }) => {
  const [editorState, setEditorState] = useState({ x: 0, y: 0, scale: 1.0 });
  const MIN_VIEW_SCALE = 0.15;
  const MAX_VIEW_SCALE = 15;
  const canvasRef = useRef(null);
  const previewCanvasRef = useRef(null);
  const resizeObserver = useRef(null);
  const [dragMode, setDragMode] = useState(DRAG_MODE_IDLE);
  const [spaceDown, setSpaceDown] = useState(false);
  const [dragPort, setDragPort] = useState(null);
  const [networkPosition, setNetworkPosition] = useState({ x: 0, y: 0 });
  const [dragPosition, setDragPosition] = useState({ x: 0, y: 0 });
  const [shouldDraw, setShouldDraw] = useState(true);

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.keyCode === 32) {
        if (e.target.nodeName === 'INPUT' && e.target.type === 'text') return;
        e.preventDefault();
        setSpaceDown(true);
      }
    };

    const handleKeyUp = (e) => {
      if (e.keyCode === 32) {
        if (e.target.nodeName === 'INPUT' && e.target.type === 'text') return;
        e.preventDefault();
        setSpaceDown(false);
      } else if (e.keyCode === 46 || e.keyCode === 8) {
        // Delete or backspace;
        if (e.target.localName === 'input' || e.target.localName === 'textarea') return;
        e.preventDefault();
        onDeleteSelection();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [onDeleteSelection]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    const gl = offscreenCanvas.getContext('webgl');
    const programInfo = twgl.createProgramInfo(gl, [VERTEX_SHADER, FRAGMENT_SHADER]);

    // Create a default checkerboard texture.
    const checkerTexture = {
      mag: gl.NEAREST,
      min: gl.LINEAR,
      src: [255, 255, 255, 255, 192, 192, 192, 255, 192, 192, 192, 255, 255, 255, 255, 255],
    };
    const defaultTexture = twgl.createTexture(gl, checkerTexture);

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
    const nodeRectBufferInfo = twgl.createBufferInfoFromArrays(gl, arrays);

    const draw = () => {
      // Drawing logic here
    };

    const animate = () => {
      if (shouldDraw) {
        draw();
        setShouldDraw(false);
      }
      requestAnimationFrame(animate);
    };

    animate();

    return () => {
      // Cleanup logic here
    };
  }, [offscreenCanvas, shouldDraw]);

  // Event handlers and drawing logic here

  return (
    <div className="network relative">
      <canvas ref={previewCanvasRef} className="absolute inset-0 pointer-events-none" />
      <canvas
        className="network__canvas"
        ref={canvasRef}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onDoubleClick={handleDoubleClick}
        onWheel={handleMouseWheel}
        onContextMenu={handleContextMenu}
      />
    </div>
  );
};

export default NetworkEditor;
