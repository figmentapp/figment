import * as Comlink from 'comlink';
import * as twgl from 'twgl.js';
import * as figment from '../figment';
import Network, { getDefaultNetwork } from './Network';
import Library from './Library';
import NodePreview from './NodePreview';

globalThis.twgl = twgl;
globalThis.figment = figment;

const RENDER_STATE_IDLE = 'idle';
const RENDER_STATE_RENDERING = 'rendering';
let _appPath = null;
let _network = null;
let _library = null;
let _renderState = RENDER_STATE_IDLE;
let _scheduledNetwork = null;
let _renderCanvas = null;
let _gl = null;
let _nodePreview = null;

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

async function captureRenderOutputs(network) {
  let framePromise = null;
  const outNode = network.nodes.find((n) => n.type === 'core.out');
  if (outNode && outNode.outPorts?.[0]?.value?._fbo) {
    framePromise = captureFramebufferBitmap(outNode.outPorts[0].value);
  }

  const previewPromise = _nodePreview ? _nodePreview.render(network, captureFramebufferBitmap) : null;
  const [frameData, previewOverlay] = await Promise.all([framePromise, previewPromise]);

  return {
    frameBitmap: frameData ? frameData.bitmap : null,
    previewOverlay,
  };
}

const service = {
  init: (appPath, canvas) => {
    _appPath = appPath;
    ensureRenderContext(canvas);
    if (!_nodePreview) {
      _nodePreview = new NodePreview({
        canvas: _renderCanvas,
        ensureRenderContext: (targetCanvas) => ensureRenderContext(targetCanvas ?? _renderCanvas),
      });
    } else {
      _nodePreview.setCanvas(_renderCanvas);
    }
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
    if (!_nodePreview) {
      _nodePreview = new NodePreview({
        canvas: _renderCanvas,
        ensureRenderContext: (targetCanvas) => ensureRenderContext(targetCanvas ?? _renderCanvas),
      });
    }
    _nodePreview.setViewport(viewport);
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
