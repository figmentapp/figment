import * as Comlink from 'comlink';
import * as twgl from 'twgl.js';
import * as figment from '../figment';
import Network, { getDefaultNetwork } from './Network';
import Library from './Library';

globalThis.twgl = twgl;
globalThis.figment = figment;

const RENDER_STATE_IDLE = 'idle';
const RENDER_STATE_RENDERING = 'rendering';

const NODE_WIDTH = 100;
const NODE_HEIGHT = 56;
const NODE_BORDER = 1.5;
const PREVIEW_GEO_WIDTH = NODE_WIDTH;
const PREVIEW_GEO_HEIGHT = NODE_HEIGHT;
const PREVIEW_GEO_RATIO = PREVIEW_GEO_WIDTH / PREVIEW_GEO_HEIGHT;

const PREVIEW_VERTEX_SHADER = `
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
  pos.x = pos.x * 2.0 - 1.0;
  pos.y = (1.0 - pos.y) * 2.0 - 1.0;
  gl_Position = vec4(pos, 0.0, 1.0);
}
`;

const PREVIEW_FRAGMENT_SHADER = `
precision mediump float;
uniform sampler2D u_texture;
uniform vec2 u_resolution;
uniform vec4 u_color;
varying vec2 v_uv;
void main() {
  float image_ratio = u_resolution.x / u_resolution.y;
  float box_width = ${PREVIEW_GEO_WIDTH}.0;
  float box_height = ${PREVIEW_GEO_HEIGHT}.0;
  float box_ratio = ${PREVIEW_GEO_RATIO};
  float delta_ratio = box_ratio / image_ratio;
  if (image_ratio > box_ratio) {
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

let _appPath = null;
let _network = null;
let _library = null;
let _renderState = RENDER_STATE_IDLE;
let _scheduledNetwork = null;
let _renderCanvas = null;
let _gl = null;
let _previewViewport = { width: 0, height: 0, x: 0, y: 0, scale: 1 };
let _previewFramebufferInfo = null;
let _previewProgramInfo = null;
let _previewBufferInfo = null;
let _previewDefaultTexture = null;

async function renderNetwork(network) {
  let result;
  try {
    await network.render();
    const { frameBitmap, previewOverlay } = await captureRenderOutputs(network);
    const transferables = [];
    if (frameBitmap) transferables.push(frameBitmap);
    if (previewOverlay?.bitmap) transferables.push(previewOverlay.bitmap);
    result = Comlink.transfer(
      {
        success: true,
        frame: frameBitmap ?? null,
        previewOverlay: previewOverlay ?? null,
      },
      transferables,
    );
  } catch (error) {
    result = { success: false, error: error.message };
  } finally {
    // See if there is another network to render
    if (_scheduledNetwork !== null) {
      const nextNetwork = _scheduledNetwork;
      _scheduledNetwork = null;
      renderNetwork(nextNetwork);
    } else {
      _renderState = RENDER_STATE_IDLE;
    }
  }
  return result;
}

function scheduleRender(network) {
  _scheduledNetwork = network;
  requestAnimationFrame(renderNetwork);
}

function ensureRenderContext(canvas) {
  if (!_renderCanvas) {
    _renderCanvas = canvas ?? new OffscreenCanvas(1, 1);
  }
  if (!_gl) {
    globalThis.window = globalThis.window || globalThis;
    _gl =
      _renderCanvas.getContext('webgl', { premultipliedAlpha: false }) || _renderCanvas.getContext('webgl2', { premultipliedAlpha: false });
    if (!_gl) {
      throw new Error('Unable to create WebGL context in render worker');
    }
    globalThis.window = globalThis;
    window.gl = _gl;
  }
  return _gl;
}

async function captureFramebufferBitmap(framebuffer) {
  if (!framebuffer || !framebuffer._fbo) return null;
  const gl = ensureRenderContext(_renderCanvas);
  const width = framebuffer.width || framebuffer._fbo.width || 0;
  const height = framebuffer.height || framebuffer._fbo.height || 0;
  if (!width || !height) return null;

  twgl.bindFramebufferInfo(gl, framebuffer._fbo);
  const pixels = new Uint8ClampedArray(width * height * 4);
  gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
  twgl.bindFramebufferInfo(gl, null);

  const imageData = new ImageData(pixels, width, height);
  const bitmap = await createImageBitmap(imageData, { imageOrientation: 'flipY' });
  return { bitmap, width, height };
}

function ensurePreviewResources() {
  const gl = ensureRenderContext(_renderCanvas);
  if (!_previewProgramInfo) {
    _previewProgramInfo = twgl.createProgramInfo(gl, [PREVIEW_VERTEX_SHADER, PREVIEW_FRAGMENT_SHADER]);
  }
  if (!_previewBufferInfo) {
    const w = PREVIEW_GEO_WIDTH;
    const h = PREVIEW_GEO_HEIGHT;
    const positionData = new Float32Array([0, 0, w, 0, 0, h, 0, h, w, 0, w, h]);
    const uvData = new Float32Array([0, 0, 1, 0, 0, 1, 0, 1, 1, 0, 1, 1]);
    _previewBufferInfo = twgl.createBufferInfoFromArrays(gl, {
      a_position: { numComponents: 2, data: positionData },
      a_uv: { numComponents: 2, data: uvData },
    });
  }
  if (!_previewDefaultTexture) {
    _previewDefaultTexture = twgl.createTexture(gl, {
      src: new Uint8Array([255, 0, 255, 255]),
      width: 1,
      height: 1,
      min: gl.NEAREST,
      mag: gl.NEAREST,
    });
  }
}

function ensurePreviewFramebuffer(width, height) {
  const gl = ensureRenderContext(_renderCanvas);
  const w = Math.max(1, Math.floor(width || 0));
  const h = Math.max(1, Math.floor(height || 0));
  if (!_previewFramebufferInfo || _previewFramebufferInfo.width !== w || _previewFramebufferInfo.height !== h) {
    if (_previewFramebufferInfo) {
      const attachments = _previewFramebufferInfo.attachments || [];
      attachments.forEach((attachment) => {
        if (!attachment) return;
        if (attachment.texture) {
          gl.deleteTexture(attachment.texture);
        } else {
          gl.deleteTexture(attachment);
        }
      });
      gl.deleteFramebuffer(_previewFramebufferInfo.framebuffer);
    }
    const attachments = [
      {
        format: gl.RGBA,
        type: gl.UNSIGNED_BYTE,
        min: gl.LINEAR,
        mag: gl.LINEAR,
        wrap: gl.CLAMP_TO_EDGE,
      },
    ];
    _previewFramebufferInfo = twgl.createFramebufferInfo(gl, attachments, w, h);
  }
  return _previewFramebufferInfo;
}

async function renderPreviewOverlay(network) {
  const { width, height, x = 0, y = 0, scale = 1 } = _previewViewport || {};
  if (!network || !width || !height) {
    return null;
  }

  ensurePreviewResources();
  const gl = ensureRenderContext(_renderCanvas);
  const framebufferInfo = ensurePreviewFramebuffer(width, height);

  twgl.bindFramebufferInfo(gl, framebufferInfo);
  gl.viewport(0, 0, width, height);
  gl.clearColor(0.05, 0.06, 0.09, 1.0);
  gl.clear(gl.COLOR_BUFFER_BIT);
  gl.enable(gl.BLEND);
  gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

  gl.useProgram(_previewProgramInfo.program);
  twgl.setBuffersAndAttributes(gl, _previewProgramInfo, _previewBufferInfo);
  twgl.setUniforms(_previewProgramInfo, {
    u_viewport: [width, height],
    u_camera: [x, y, scale],
  });

  for (const node of network.nodes || []) {
    const outPort = node?.outPorts?.[0];
    const value = outPort?.value;
    let texture = _previewDefaultTexture;
    let textureWidth = PREVIEW_GEO_WIDTH;
    let textureHeight = PREVIEW_GEO_HEIGHT;
    let color = [1, 0, 1, 1];

    if (value && value._fbo && value._fbo.attachments && value._fbo.attachments[0]) {
      texture = value._fbo.attachments[0];
      textureWidth = value.width || value._fbo.width || PREVIEW_GEO_WIDTH;
      textureHeight = value.height || value._fbo.height || PREVIEW_GEO_HEIGHT;
      color = [1, 1, 1, 1];
    }

    const destWidth = NODE_WIDTH * scale - NODE_BORDER * 2;
    const destHeight = NODE_HEIGHT * scale - NODE_BORDER * 2;
    if (destWidth <= 0 || destHeight <= 0) {
      continue;
    }

    twgl.setUniforms(_previewProgramInfo, {
      u_position: [node.x, node.y],
      u_texture: texture,
      u_color: color,
      u_resolution: [textureWidth, textureHeight],
    });
    twgl.drawBufferInfo(gl, _previewBufferInfo);
  }

  gl.disable(gl.BLEND);
  twgl.bindFramebufferInfo(gl, null);

  const overlayData = await captureFramebufferBitmap({
    _fbo: framebufferInfo,
    width,
    height,
  });
  return overlayData;
}

async function captureRenderOutputs(network) {
  let framePromise = null;
  const outNode = network.nodes.find((n) => n.type === 'core.out');
  if (outNode && outNode.outPorts?.[0]?.value?._fbo) {
    framePromise = captureFramebufferBitmap(outNode.outPorts[0].value);
  }

  const [frameData, previewOverlay] = await Promise.all([framePromise, renderPreviewOverlay(network)]);

  return {
    frameBitmap: frameData ? frameData.bitmap : null,
    previewOverlay,
  };
}

const service = {
  init: (appPath, canvas) => {
    _appPath = appPath;
    ensureRenderContext(canvas);
    _library = new Library();
    const nodeTypes = _library.nodeTypes.map((n) => ({ name: n.name, type: n.type, description: n.description }));
    return { nodeTypes };
  },
  loadNetwork: async (networkSchema) => {
    ensureRenderContext(_renderCanvas);
    const schema = networkSchema || getDefaultNetwork(_appPath);
    _network = new Network(_library);
    _network.parse(schema);
    await _network.start();
    return _network.toSchema();
  },
  renderFrame: async () => {
    if (_renderState === RENDER_STATE_IDLE) {
      _renderState = RENDER_STATE_RENDERING;
      const result = await renderNetwork(_network);
      return result;
    } else {
      // Worker is busy, schedule this render
      // Replace any existing scheduled render with this newer one.
      _scheduledNetwork = _network;
      return { success: false, busy: true };
    }
  },
  setPreviewViewport: (viewport) => {
    if (!viewport) {
      _previewViewport = { width: 0, height: 0, x: 0, y: 0, scale: 1 };
      return;
    }
    const next = {
      width: Math.max(0, Math.floor(viewport.width ?? 0)),
      height: Math.max(0, Math.floor(viewport.height ?? 0)),
      x: typeof viewport.x === 'number' ? viewport.x : 0,
      y: typeof viewport.y === 'number' ? viewport.y : 0,
      scale: typeof viewport.scale === 'number' ? viewport.scale : 1,
    };
    _previewViewport = next;
    if (next.width > 0 && next.height > 0) {
      ensurePreviewResources();
      ensurePreviewFramebuffer(next.width, next.height);
    }
  },
  captureNodePreview: async (nodeId) => {
    if (!_network) {
      return { success: false, error: 'Network not loaded' };
    }
    const node = _network.nodes.find((n) => n.id === nodeId);
    if (!node) {
      return { success: false, error: `Node ${nodeId} not found` };
    }
    const outPort = node.outPorts?.[0];
    const value = outPort && outPort.value;
    if (!value || !value._fbo) {
      return { success: false, error: 'Node has no render output' };
    }
    const data = await captureFramebufferBitmap(value);
    if (!data?.bitmap) {
      return { success: false, error: 'Unable to capture node preview' };
    }
    return Comlink.transfer(
      {
        success: true,
        nodeId,
        width: data.width,
        height: data.height,
        bitmap: data.bitmap,
      },
      [data.bitmap],
    );
  },
};

Comlink.expose(service);

// onmessage = (e) => {
//   const { type, ...data } = e.data;
//   switch (type) {
//     case 'INIT':
//       _appPath = data?.appPath || null;
//       _library = new Library();
//       postMessage({
//         type: 'INIT_DONE',
//         nodeTypes: _library.nodeTypes.map((n) => ({ name: n.name, type: n.type, description: n.description })),
//       });
//       break;
//     case 'LOAD':
//       // Initialize library and network
//       const networkSchema = data?.network || getDefaultNetwork(_appPath);
//       _network = new Network(_library);
//       _network.parse(networkSchema);
//       postMessage({ type: 'LOAD_DONE', network: _network.serialize() });
//       break;
//     case 'RENDER':
//       if (_renderState === RENDER_STATE_IDLE) {
//         _renderState = RENDER_STATE_RENDERING;
//         renderNetwork(data.network);
//       } else {
//         // Worker is busy, schedule this render
//         // Replace any existing scheduled render with this newer one.
//         _scheduledNetwork = e.network;
//       }
//       break;
//     default:
//       postMessage({ type: 'ERROR', error: `Unknown message type: ${type}` });
//   }
// };
