// Functions that are available in the "figment" namespace. Related to project files.
// Look in preload.js for functions that are exposed in this module (e.g. nodePath).
import * as twgl from 'twgl.js';

let _gpu = {
  adapter: null,
  device: null,
  queue: null,
  canvasContext: null,
  canvasFormat: null,
  defaultSampler: null,
};
window._gpu = _gpu;

export async function initWebGPUDevice() {
  if (!('gpu' in navigator)) {
    throw new Error('WebGPU not available. Ensure Chromium/Electron supports it and it is enabled.');
  }
  if (_gpu.device) return _gpu.device;
  _gpu.adapter = await navigator.gpu.requestAdapter();
  if (!_gpu.adapter) throw new Error('WebGPU adapter not found.');
  _gpu.device = await _gpu.adapter.requestDevice();
  _gpu.queue = _gpu.device.queue;
  _gpu.defaultSampler = _gpu.device.createSampler({
    magFilter: 'linear',
    minFilter: 'linear',
    mipmapFilter: 'linear',
    addressModeU: 'clamp-to-edge',
    addressModeV: 'clamp-to-edge',
    addressModeW: 'clamp-to-edge',
  });
  return _gpu.device;
}

export function initWebGPUCanvas(canvas) {
  // Configure a canvas for presentation. Call once per on-screen canvas.
  // You can call this in Viewer.jsx when the canvas ref is ready.
  if (!_gpu.device) throw new Error('Call initWebGPUDevice() before initWebGPUCanvas().');
  const context = canvas.getContext('webgpu');
  const canvasFormat = navigator.gpu.getPreferredCanvasFormat();
  context.configure({ device: _gpu.device, format: canvasFormat, alphaMode: 'premultiplied' });
  _gpu.canvasContext = context;
  _gpu.canvasFormat = canvasFormat;
  return context;
}

// Default full-screen triangle vertex shader
const DEFAULT_VERTEX_WGSL = `
struct VertexOutput {
  @builtin(position) position: vec4f,
  @location(0) uv: vec2f,
};

@vertex
fn vs_main(@builtin(vertex_index) vid: u32) -> VertexOutput {
  var pos = array<vec2f, 3>(
    vec2f(-1.0, -1.0),
    vec2f( 3.0, -1.0),
    vec2f(-1.0,  3.0)
  );
  var uv = array<vec2f, 3>(
    vec2f(0.0, 0.0),
    vec2f(2.0, 0.0),
    vec2f(0.0, 2.0)
  );
  var out: VertexOutput;
  out.position = vec4f(pos[vid], 0.0, 1.0);
  out.uv = uv[vid];
  return out;
}`;

// Utility to compose a fragment-only shader body into a full WGSL program with
// a default vertex and standard bindings.
//
// - uniformsSpec: map of name -> WGSL type string (e.g. 'f32', 'vec2f', 'mat4x4f')
// - textures: array of texture binding names to inject (e.g. ['u_input_texture'])
//
// The fragmentBody should be WGSL that returns a vec4f and can reference:
// - uniforms: `u` (struct of provided uniforms)
// - sampler: `defaultSampler`
// - textures: each provided name as `texture_2d<f32>` (e.g. u_input_texture)
// - input UV: `in.uv`
//
// Example body:
//   `return textureSample(u_input_texture, defaultSampler, in.uv);`
export function makeFragmentWGSL(fragmentBody, { uniformsSpec = {}, textures = [] } = {}) {
  const uniformEntries = Object.entries(uniformsSpec);
  const hasUniforms = uniformEntries.length > 0;
  const uniformsStruct = hasUniforms
    ? `struct Uniforms {\n${uniformEntries.map(([k, t]) => `  ${k}: ${t},`).join('\n')}\n};\n@group(0) @binding(0) var<uniform> u: Uniforms;\n`
    : '';
  const samplerDecl = '@group(0) @binding(1) var defaultSampler: sampler;\n';
  const textureDecls = textures.map((name, i) => `@group(0) @binding(${i + 2}) var ${name}: texture_2d<f32>;`).join('\n');
  const frag = `
${uniformsStruct}${samplerDecl}${textureDecls}

@fragment
fn fs_main(in: VertexOutput) -> @location(0) vec4f {
  ${fragmentBody}
}
`;
  const full = `${DEFAULT_VERTEX_WGSL}\n${frag}`;
  return full;
}

// Packs a JS uniforms object according to a simple spec into an ArrayBuffer.
// Supports: f32, vec2f, vec3f, vec4f, mat4x4f. Aligns to 16 bytes per rules.
function _packUniforms(uniformsSpec, values) {
  const entries = Object.entries(uniformsSpec);
  if (entries.length === 0) return { buffer: null, size: 0 };

  // Compute size with 16-byte alignment per struct member
  let size = 0;
  const offsets = {};
  function align(n, alignment) {
    return Math.ceil(n / alignment) * alignment;
  }
  function typeSize(t) {
    switch (t) {
      case 'f32':
        return 4;
      case 'vec2<f32>':
      case 'vec2f':
        return 8;
      case 'vec3<f32>':
      case 'vec3f':
        return 12; // but align to 16
      case 'vec4<f32>':
      case 'vec4f':
        return 16;
      case 'mat4x4<f32>':
      case 'mat4x4f':
        return 64;
      default:
        throw new Error('Unsupported uniform type: ' + t);
    }
  }
  for (const [name, t] of entries) {
    const ts = typeSize(t);
    const alignTo = t.startsWith('mat4') || t.startsWith('vec4') || t.startsWith('vec3') ? 16 : ts;
    size = align(size, alignTo);
    offsets[name] = size;
    size += t.startsWith('vec3') ? 16 : ts; // vec3 pads to 16
  }
  size = Math.ceil(size / 16) * 16; // pad struct size to 16

  const buffer = new ArrayBuffer(size);
  const f32 = new Float32Array(buffer);
  function write(name, t, v) {
    const byteOffset = offsets[name];
    const floatOffset = byteOffset / 4;
    switch (t) {
      case 'f32':
        f32[floatOffset] = v;
        break;
      case 'vec2f':
      case 'vec2<f32>':
        f32.set(v, floatOffset);
        break;
      case 'vec3f':
      case 'vec3<f32>':
        f32.set([v[0], v[1], v[2], 0], floatOffset); // pad to 4 floats
        break;
      case 'vec4f':
      case 'vec4<f32>':
        f32.set(v, floatOffset);
        break;
      case 'mat4x4f':
      case 'mat4x4<f32>':
        f32.set(v, floatOffset);
        break;
      default:
        throw new Error('Unsupported uniform type: ' + t);
    }
  }
  for (const [name, t] of entries) {
    write(name, t, values[name]);
  }
  return { buffer, size };
}

// Create a basic render pipeline for full-screen passes.
// - fragmentWGSL: string returned by makeFragmentWGSL or a full WGSL program
// - format: render target format (defaults to GPU canvas format)
export function createRenderPipeline({ fragmentWGSL, format = null, label = 'figment-pipeline' }) {
  if (!_gpu.device) throw new Error('initWebGPUDevice() must be called before creating pipelines.');
  const device = _gpu.device;
  const module = device.createShaderModule({ code: fragmentWGSL });
  const pipeline = device.createRenderPipeline({
    label,
    layout: 'auto',
    vertex: { module, entryPoint: 'vs_main' },
    fragment: { module, entryPoint: 'fs_main', targets: [{ format: format || _gpu.canvasFormat || 'rgba8unorm' }] },
    primitive: { topology: 'triangle-list' },
  });
  return pipeline;
}

// Load an image and create a sampled GPU texture + view.
export async function createGPUTextureFromUrl(url, { mips = false } = {}) {
  if (!_gpu.device) throw new Error('initWebGPUDevice() must be called before creating textures.');
  const img = new Image();
  img.crossOrigin = 'anonymous';
  img.src = url;
  await img.decode();
  const bitmap = await createImageBitmap(img, { colorSpaceConversion: 'none' });
  const texture = _gpu.device.createTexture({
    size: { width: bitmap.width, height: bitmap.height },
    format: 'rgba8unorm',
    usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST | (mips ? GPUTextureUsage.RENDER_ATTACHMENT : 0),
    mipLevelCount: 1,
  });
  _gpu.queue.copyExternalImageToTexture({ source: bitmap }, { texture }, { width: bitmap.width, height: bitmap.height });
  const view = texture.createView();
  return { texture, view, width: bitmap.width, height: bitmap.height };
}

// RenderTarget is a per-node, self-managed GPU texture you can render into.
// Nodes own their own targets (no pooling) and resize as needed.
export class RenderTarget {
  constructor(width = 0, height = 0, { format = 'rgba8unorm' } = {}) {
    this.width = 0;
    this.height = 0;
    this.format = format;
    this.texture = null;
    this.view = null;
    this._encoder = null;
    this._pass = null;
    if (width > 0 && height > 0) this.setSize(width, height);
  }

  setSize(width, height) {
    if (width === this.width && height === this.height && this.texture) return;
    this.width = width;
    this.height = height;
    if (this.texture) this.texture.destroy();
    this.texture = _gpu.device.createTexture({
      size: { width, height },
      format: this.format,
      usage:
        GPUTextureUsage.RENDER_ATTACHMENT |
        GPUTextureUsage.TEXTURE_BINDING |
        GPUTextureUsage.COPY_SRC |
        GPUTextureUsage.COPY_DST,
    });
    this.view = this.texture.createView();
  }

  // Begin a render pass targeting this texture.
  bind(clearColor = [0, 0, 0, 0]) {
    if (!this.texture) throw new Error('RenderTarget not initialized. Call setSize() first.');
    this._encoder = _gpu.device.createCommandEncoder();
    this._pass = this._encoder.beginRenderPass({
      colorAttachments: [
        {
          view: this.view,
          loadOp: 'clear',
          clearValue: { r: clearColor[0], g: clearColor[1], b: clearColor[2], a: clearColor[3] },
          storeOp: 'store',
        },
      ],
    });
  }

  unbind() {
    if (!this._pass || !this._encoder) return;
    this._pass.end();
    _gpu.queue.submit([this._encoder.finish()]);
    this._pass = null;
    this._encoder = null;
  }

  // Upload an external image source (HTMLVideoElement, HTMLCanvasElement, ImageBitmap)
  // into this render target's texture. Resizes the texture if needed.
  uploadExternal(source, width = null, height = null) {
    if (!_gpu.device) throw new Error('initWebGPUDevice() must be called first.');
    // Infer dimensions if not provided
    let w = width;
    let h = height;
    if (w == null || h == null) {
      if (source instanceof HTMLVideoElement) {
        w = source.videoWidth;
        h = source.videoHeight;
      } else if (source instanceof HTMLCanvasElement || source instanceof OffscreenCanvas) {
        w = source.width;
        h = source.height;
      } else if (source instanceof ImageBitmap) {
        w = source.width;
        h = source.height;
      } else if ('width' in source && 'height' in source) {
        w = source.width;
        h = source.height;
      }
    }
    if (!w || !h) throw new Error('uploadExternal: unable to determine source dimensions.');
    this.setSize(w, h);
    try {
      _gpu.queue.copyExternalImageToTexture({ source }, { texture: this.texture }, { width: w, height: h });
    } catch (e) {
      // Fallback: draw to an intermediate canvas first (avoids cross-origin/video restrictions).
      let canvas = uploadExternal._scratchCanvas;
      if (!canvas) {
        canvas = document.createElement('canvas');
        uploadExternal._scratchCanvas = canvas;
        uploadExternal._scratchCtx = canvas.getContext('2d');
      }
      const ctx2d = uploadExternal._scratchCtx;
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
      }
      try {
        ctx2d.drawImage(source, 0, 0, w, h);
        _gpu.queue.copyExternalImageToTexture({ source: canvas }, { texture: this.texture }, { width: w, height: h });
      } catch (e2) {
        console.warn('uploadExternal fallback failed:', e2);
      }
    }
  }
}

// Draw a full-screen triangle into the currently bound RenderTarget pass.
// - pipeline: created via createRenderPipeline()
// - bindings: { uniforms: { ... }, uniformsSpec: { name: type }, textures: { name: GPUTextureView | { view, sampler? } } }
export function drawFullscreen(pipeline, { uniforms = {}, uniformsSpec = {}, textures = {} } = {}, target = null) {
  if (target && !target._pass) target.bind();
  const pass = target ? target._pass : null;
  if (!pass) throw new Error('No active RenderTarget. Call target.bind() before drawFullscreen().');

  // Prepare bind group resources.
  const device = _gpu.device;
  let entries = [];
  let index = 0;

  // Binding 0: uniform buffer (optional)
  if (Object.keys(uniformsSpec).length > 0) {
    const { buffer, size } = _packUniforms(uniformsSpec, uniforms);
    const ubuf = device.createBuffer({ size, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
    _gpu.queue.writeBuffer(ubuf, 0, buffer);
    entries.push({ binding: index, resource: { buffer: ubuf } });
    index += 1;
  } else {
    // Still reserve binding 0 if pipeline expects it (makeFragmentWGSL always adds sampler at 1)
    // If there are no uniforms, we start textures at binding 2 after sampler.
  }

  // Binding 1: default sampler
  entries.push({ binding: 1, resource: _gpu.defaultSampler });

  // Texture bindings from 2..N
  let texIndex = 2;
  for (const [name, value] of Object.entries(textures)) {
    const view = value && value.view ? value.view : value; // accept GPUTextureView or {view}
    if (!view) throw new Error(`Texture '${name}' missing view`);
    entries.push({ binding: texIndex, resource: view });
    texIndex += 1;
  }

  const bindGroup = device.createBindGroup({ layout: pipeline.getBindGroupLayout(0), entries });

  pass.setPipeline(pipeline);
  pass.setBindGroup(0, bindGroup);
  pass.draw(3, 1, 0, 0);
}

export function projectFile() {
  if (!window.app) return '';
  if (!window.app.state.filePath) return '';
  return window.app.state.filePath;
}

export function projectDirectory() {
  if (!window.app) return '';
  if (!window.app.state.filePath) return '';
  return nodePath.dirname(window.app.state.filePath);
}

export function ensureDirectory(dir) {
  if (!window.app) return;
  window.desktop.ensureDirectory(dir);
}

export function filePathForAsset(filename) {
  if (typeof window.figmentPlayer !== 'undefined') return filename;
  if (nodePath.isAbsolute(filename)) return filename;
  const filePath = nodePath.resolve(projectDirectory(), filename);
  return filePath;
}

export function urlForAsset(filename) {
  if (typeof window.figmentPlayer !== 'undefined') return filename;
  const filePath = filePathForAsset(filename);
  const absoluteFilePath = nodePath.resolve(filePath);
  const assetUrl = window.desktop.pathToFileURL(absoluteFilePath);
  return assetUrl;
}

export function debounce(fn, delay) {
  let timer = null;
  return function () {
    const context = this;
    const args = arguments;
    clearTimeout(timer);
    timer = setTimeout(() => fn.apply(context, args), delay);
  };
}

export function filePathToRelative(filename) {
  return nodePath.relative(projectDirectory(), filename);
}

const _loadedScripts = new Set();
export async function loadScripts(scripts) {
  const loadScript = (script) => {
    return new Promise((resolve, reject) => {
      const scriptElement = document.createElement('script');
      scriptElement.src = script;
      scriptElement.onload = resolve;
      scriptElement.onerror = reject;
      document.head.appendChild(scriptElement);
    });
  };

  for (const script of scripts) {
    if (_loadedScripts.has(script)) continue;
    await loadScript(script);
    _loadedScripts.add(script);
  }
}

const DEFAULT_VERTEX_SHADER = `
attribute vec3 a_position;
attribute vec2 a_uv;
varying vec2 v_uv;
void main() {
  v_uv = a_uv;
  gl_Position = vec4(a_position, 1.0);
}`;

const DEFAULT_FRAGMENT_SHADER = `
precision mediump float;
uniform sampler2D u_image;
varying vec2 v_uv;
void main() {
  gl_FragColor = texture2D(u_image, v_uv);
}
`;

const _shaderProgramCache = {};

export function createShaderProgram(shader1 = null, shader2 = null) {
  let vertexShader, fragmentShader;
  if (shader1 === null && shader2 === null) {
    vertexShader = DEFAULT_VERTEX_SHADER;
    fragmentShader = DEFAULT_FRAGMENT_SHADER;
  } else if (shader2 === null) {
    vertexShader = DEFAULT_VERTEX_SHADER;
    fragmentShader = shader1;
  } else {
    vertexShader = shader1;
    fragmentShader = shader2;
  }
  const cachedShaderProgram = _shaderProgramCache[vertexShader + fragmentShader];
  if (cachedShaderProgram) return cachedShaderProgram;
  const shaderProgram = twgl.createProgramInfo(window.gl, [vertexShader, fragmentShader]);
  _shaderProgramCache[vertexShader + fragmentShader] = shaderProgram;
  return shaderProgram;
}

export function createTextureFromUrl(url, callback) {
  return twgl.createTexture(window.gl, { src: url, crossOrigin: 'anonymous' }, callback);
}

export function createTextureFromUrlAsync(url) {
  return new Promise((resolve, reject) => {
    return twgl.createTexture(window.gl, { src: url, crossOrigin: 'anonymous' }, (err, texture, image) => {
      if (err) {
        reject(err);
        return;
      }
      resolve({ texture, image });
    });
  });
}

export function createErrorTexture() {
  const checkerTexture = {
    mag: window.gl.NEAREST,
    min: window.gl.LINEAR,
    src: [255, 255, 255, 255, 192, 192, 192, 255, 192, 192, 192, 255, 255, 255, 255, 255],
  };
  return twgl.createTexture(window.gl, checkerTexture);
}

export class Framebuffer {
  constructor(width = 0, height = 0) {
    if (width > 0 && height > 0) {
      this._create(width, height);
    }
  }

  setSize(width, height) {
    if (width === this.width && height === this.height) return;
    const gl = window.gl;
    if (this._fbo) {
      gl.deleteTexture(this._fbo.attachments[0].texture);
      gl.deleteFramebuffer(this._fbo.framebuffer);
    }
    this._create(width, height);
  }

  _create(width, height) {
    this.width = width;
    this.height = height;
    this._fbo = twgl.createFramebufferInfo(window.gl, [{ format: window.gl.RGBA }], width, height);
  }

  bind() {
    twgl.bindFramebufferInfo(window.gl, this._fbo);
  }

  unbind() {
    twgl.bindFramebufferInfo(window.gl, null);
  }

  get texture() {
    return this._fbo.attachments[0];
  }
}

export function clear() {
  const gl = window.gl;
  gl.clearColor(0, 0, 0, 0);
  gl.clear(gl.COLOR_BUFFER_BIT);
}

let _quadBufferInfo = null;

export function drawQuad(shaderProgram, uniforms) {
  const gl = window.gl;
  if (!_quadBufferInfo) {
    const arrays = {
      a_position: { numComponents: 2, data: [-1, -1, -1, 1, 1, 1, 1, -1] },
      a_uv: { numComponents: 2, data: [0, 0, 0, 1, 1, 1, 1, 0] },
      indices: [0, 1, 2, 0, 2, 3],
    };
    _quadBufferInfo = twgl.createBufferInfoFromArrays(gl, arrays);
  }
  gl.useProgram(shaderProgram.program);
  twgl.setBuffersAndAttributes(gl, shaderProgram, _quadBufferInfo);
  twgl.setUniforms(shaderProgram, uniforms);
  twgl.drawBufferInfo(gl, _quadBufferInfo);
}

export function toCanvasColor(color) {
  return `rgba(${color[0]}, ${color[1]}, ${color[2]}, ${color[3]})`;
}

let _imageData;
export function framebufferToImageData(framebuffer) {
  const width = framebuffer.width;
  const height = framebuffer.height;

  if (!_imageData || framebuffer.width !== _imageData.width || framebuffer.height !== _imageData.height) {
    _imageData = new ImageData(width, height);
    framebuffer.setSize(width, height);
  }
  framebuffer.bind();
  window.gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, _imageData.data);
  framebuffer.unbind();
  return _imageData;
}

export function canvasToFramebuffer(canvas, framebuffer) {
  window.gl.bindTexture(gl.TEXTURE_2D, framebuffer.texture);
  window.gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, canvas);
  window.gl.bindTexture(gl.TEXTURE_2D, null);
}

const _modelCache = {};
export async function loadModel(modelName, modelGlobal, options) {
  if (_modelCache[modelName]) return _modelCache[modelName];

  await figment.loadScripts([`https://cdn.jsdelivr.net/npm/@tensorflow-models/${modelName}`]);
  // await tf.ready();
  // const tfContext = new tf.webgl.GPGPUContext(window.gl);
  // tf.ENV.registerBackend('custom-webgl', () => {
  //   return new tf.webgl.MathBackendWebGL(tfContext);
  // });
  // tf.setBackend('custom-webgl');

  const model = await window[modelGlobal].load(options);
  _modelCache[modelName] = model;
  return model;
}
