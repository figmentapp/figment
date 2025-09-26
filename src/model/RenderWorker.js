import * as Comlink from 'comlink';
import * as twgl from 'twgl.js';
import Network, { getDefaultNetwork } from './Network';
import Library from './Library';

const RENDER_STATE_IDLE = 'idle';
const RENDER_STATE_RENDERING = 'rendering';

const NODE_WIDTH = 100;
const NODE_HEIGHT = 56;
const NODE_BORDER = 1.5;

let _appPath = null;
let _network = null;
let _library = null;
let _renderState = RENDER_STATE_IDLE;
let _scheduledNetwork = null;
let _renderCanvas = null;
let _gl = null;
let _previewViewport = { width: 0, height: 0, x: 0, y: 0, scale: 1 };
let _previewCanvas = null;
let _previewCtx = null;

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

function ensurePreviewCanvas(width, height) {
  const w = Math.max(1, Math.floor(width || 0));
  const h = Math.max(1, Math.floor(height || 0));
  if (!w || !h) {
    return null;
  }
  if (!_previewCanvas || _previewCanvas.width !== w || _previewCanvas.height !== h) {
    _previewCanvas = new OffscreenCanvas(w, h);
    _previewCtx = _previewCanvas.getContext('2d');
  } else if (!_previewCtx) {
    _previewCtx = _previewCanvas.getContext('2d');
  }
  return _previewCtx;
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

function composePreviewOverlay(network, previewEntries) {
  const { width, height, x = 0, y = 0, scale = 1 } = _previewViewport || {};
  if (!width || !height || !network) {
    for (const entry of previewEntries) {
      if (entry?.bitmap) {
        try {
          entry.bitmap.close();
        } catch (_) {
          // ignore
        }
      }
    }
    return null;
  }

  const ctx = ensurePreviewCanvas(width, height);
  if (!ctx) {
    for (const entry of previewEntries) {
      if (entry?.bitmap) {
        try {
          entry.bitmap.close();
        } catch (_) {
          // ignore
        }
      }
    }
    return null;
  }

  ctx.clearRect(0, 0, width, height);
  const previewMap = new Map();
  for (const entry of previewEntries) {
    if (!entry || typeof entry.nodeId !== 'number') continue;
    previewMap.set(entry.nodeId, entry);
  }

  for (const node of network.nodes || []) {
    const destX = x + node.x * scale + NODE_BORDER;
    const destY = y + node.y * scale + NODE_BORDER;
    const destWidth = NODE_WIDTH * scale - NODE_BORDER * 2;
    const destHeight = NODE_HEIGHT * scale - NODE_BORDER * 2;
    if (destWidth <= 0 || destHeight <= 0) {
      continue;
    }

    ctx.fillStyle = '#06070D';
    ctx.fillRect(destX, destY, destWidth, destHeight);

    const preview = previewMap.get(node.id);
    if (!preview || !preview.bitmap) {
      continue;
    }

    const sourceWidth = preview.width || preview.bitmap.width || 0;
    const sourceHeight = preview.height || preview.bitmap.height || 0;
    if (!sourceWidth || !sourceHeight) {
      try {
        preview.bitmap.close();
      } catch (_) {
        // ignore
      }
      continue;
    }

    const sourceRatio = sourceWidth / sourceHeight;
    const destRatio = destWidth / destHeight;
    let drawWidth = destWidth;
    let drawHeight = destHeight;
    if (sourceRatio > destRatio) {
      drawHeight = destWidth / sourceRatio;
    } else {
      drawWidth = destHeight * sourceRatio;
    }
    const offsetX = destX + (destWidth - drawWidth) / 2;
    const offsetY = destY + (destHeight - drawHeight) / 2;
    ctx.drawImage(preview.bitmap, offsetX, offsetY, drawWidth, drawHeight);

    try {
      preview.bitmap.close();
    } catch (_) {
      // ignore
    }
    previewMap.delete(node.id);
  }

  for (const entry of previewMap.values()) {
    if (entry?.bitmap) {
      try {
        entry.bitmap.close();
      } catch (_) {
        // ignore
      }
    }
  }

  const bitmap = ctx.canvas.transferToImageBitmap();
  return {
    bitmap,
    width,
    height,
  };
}

async function captureRenderOutputs(network) {
  const previewEntries = [];
  const capturePromises = [];

  for (const node of network.nodes) {
    const outPort = node.outPorts?.[0];
    const value = outPort && outPort.value;
    if (!value || !value._fbo) continue;
    const promise = captureFramebufferBitmap(value).then((data) => {
      if (!data) return;
      previewEntries.push({ nodeId: node.id, width: data.width, height: data.height, bitmap: data.bitmap });
    });
    capturePromises.push(promise);
  }

  const outNode = network.nodes.find((n) => n.type === 'core.out');
  let frameData = null;
  if (outNode && outNode.outPorts?.[0]?.value?._fbo) {
    const promise = captureFramebufferBitmap(outNode.outPorts[0].value).then((data) => {
      frameData = data ?? null;
    });
    capturePromises.push(promise);
  }

  if (capturePromises.length) {
    await Promise.all(capturePromises);
  }

  const previewOverlay = previewEntries.length ? composePreviewOverlay(network, previewEntries) : null;

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
  loadNetwork: (networkSchema) => {
    ensureRenderContext(_renderCanvas);
    const schema = networkSchema || getDefaultNetwork(_appPath);
    _network = new Network(_library);
    _network.parse(schema);
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
      ensurePreviewCanvas(next.width, next.height);
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
