// WebGPU helpers for Figment. Module-level GPU device singleton.
// Non-GPU utilities (project paths, debounce, etc.) are also exported from here.

export { buildSaveImagePath, encodeWithCanvasFallback, ensureFallbackCanvas, parseSaveImageTemplate } from './saveImageShared.js';
export { createImageEncoder } from './imageEncoder.js';
export {
  PoseGpuPipeline,
  HandGpuPipeline,
  FaceGpuPipeline,
  SegmentGpuPipeline,
  MAX_INSTANCES as MEDIAPIPE_MAX_INSTANCES,
  withOrt,
  createOrtSession,
} from './mediapipe-gpu.js';
export { LandmarkRenderer, OverlayBatch, drawConnectors, drawLandmarks } from './landmark-drawing.js';
export {
  POSE_CONNECTIONS,
  POSE_LANDMARK_COLORS,
  POSE_CONNECTION_COLORS,
  OPENPOSE_COLORS,
  HAND_CONNECTIONS,
  FACE_LANDMARKS_CONTOURS,
  FACE_LANDMARKS_TESSELATION,
} from './landmark-connections.js';

// ─── GPU State ──────────────────────────────────────────────────────────────

let _device = null;
let _queue = null;
let _adapter = null;
let _gpuStatus = 'uninitialized'; // 'uninitialized' | 'ready' | 'lost' | 'error' | 'unavailable'
let _deviceLostCallbacks = [];

export function getAdapter() {
  return _adapter;
}

export function getDevice() {
  return _device;
}

export function getQueue() {
  return _queue;
}

export function getGPUStatus() {
  return _gpuStatus;
}

export function onDeviceLost(callback) {
  _deviceLostCallbacks.push(callback);
}

export function _setDeviceForTesting(device, queue) {
  _device = device;
  _queue = queue;
  _gpuStatus = device ? 'ready' : 'uninitialized';
}

export function validateFeatureSupport(features) {
  if (!_adapter) return { supported: [], unsupported: features };
  const supported = features.filter((f) => _adapter.features.has(f));
  const unsupported = features.filter((f) => !_adapter.features.has(f));
  return { supported, unsupported };
}

export async function initGPU(options = {}) {
  const { requiredFeatures = [], requiredLimits = {}, powerPreference = 'high-performance' } = options;

  if (!navigator.gpu) {
    _gpuStatus = 'unavailable';
    throw new Error('WebGPU is not supported in this environment');
  }

  try {
    _adapter = await navigator.gpu.requestAdapter({ powerPreference });
    if (!_adapter) {
      _gpuStatus = 'error';
      throw new Error('No GPU adapter found');
    }

    if (requiredFeatures.length > 0) {
      const { unsupported } = validateFeatureSupport(requiredFeatures);
      if (unsupported.length > 0) {
        console.warn('Unsupported GPU features:', unsupported);
      }
    }

    const supportedFeatures = requiredFeatures.filter((f) => _adapter.features.has(f));

    // Request adapter-max compute limits so that libraries like ONNX Runtime
    // can reuse this device without hitting limit validation errors.
    const adapterMaxLimits = {
      maxComputeWorkgroupStorageSize: _adapter.limits.maxComputeWorkgroupStorageSize,
      maxComputeWorkgroupsPerDimension: _adapter.limits.maxComputeWorkgroupsPerDimension,
      maxStorageBufferBindingSize: _adapter.limits.maxStorageBufferBindingSize,
      maxBufferSize: _adapter.limits.maxBufferSize,
      maxComputeInvocationsPerWorkgroup: _adapter.limits.maxComputeInvocationsPerWorkgroup,
      maxComputeWorkgroupSizeX: _adapter.limits.maxComputeWorkgroupSizeX,
      maxComputeWorkgroupSizeY: _adapter.limits.maxComputeWorkgroupSizeY,
      maxComputeWorkgroupSizeZ: _adapter.limits.maxComputeWorkgroupSizeZ,
    };

    _device = await _adapter.requestDevice({
      requiredFeatures: supportedFeatures,
      requiredLimits: { ...adapterMaxLimits, ...requiredLimits },
    });

    _queue = _device.queue;

    _device.lost.then((info) => {
      console.error(`GPU device lost: ${info.message} (reason: ${info.reason})`);
      _gpuStatus = 'lost';
      _device = null;
      _queue = null;
      _destroySamplers();
      _placeholderTexture = null;
      _placeholderTextureView = null;
      for (const cb of _deviceLostCallbacks) {
        try {
          cb(info);
        } catch (e) {
          console.error('Device lost callback error:', e);
        }
      }
    });

    _device.onuncapturederror = (event) => {
      console.error('Uncaptured GPU error:', event.error.message);
    };

    _createSamplers();
    _gpuStatus = 'ready';
    return _device;
  } catch (err) {
    if (_gpuStatus !== 'unavailable') _gpuStatus = 'error';
    throw err;
  }
}

// ─── Shared Samplers ────────────────────────────────────────────────────────

export const samplers = {
  linearClamp: null,
  linearRepeat: null,
  nearestClamp: null,
  nearestRepeat: null,
};

function _createSamplers() {
  samplers.linearClamp = _device.createSampler({
    magFilter: 'linear',
    minFilter: 'linear',
    addressModeU: 'clamp-to-edge',
    addressModeV: 'clamp-to-edge',
  });
  samplers.linearRepeat = _device.createSampler({
    magFilter: 'linear',
    minFilter: 'linear',
    addressModeU: 'repeat',
    addressModeV: 'repeat',
  });
  samplers.nearestClamp = _device.createSampler({
    magFilter: 'nearest',
    minFilter: 'nearest',
    addressModeU: 'clamp-to-edge',
    addressModeV: 'clamp-to-edge',
  });
  samplers.nearestRepeat = _device.createSampler({
    magFilter: 'nearest',
    minFilter: 'nearest',
    addressModeU: 'repeat',
    addressModeV: 'repeat',
  });
}

function _destroySamplers() {
  samplers.linearClamp = null;
  samplers.linearRepeat = null;
  samplers.nearestClamp = null;
  samplers.nearestRepeat = null;
}

// ─── Uniform Packing ────────────────────────────────────────────────────────

// WGSL type → { size, align, components }
const UNIFORM_TYPE_INFO = {
  f32: { size: 4, align: 4, components: 1 },
  i32: { size: 4, align: 4, components: 1 },
  u32: { size: 4, align: 4, components: 1 },
  vec2f: { size: 8, align: 8, components: 2 },
  vec2i: { size: 8, align: 8, components: 2 },
  vec2u: { size: 8, align: 8, components: 2 },
  vec3f: { size: 12, align: 16, components: 3 },
  vec3i: { size: 12, align: 16, components: 3 },
  vec3u: { size: 12, align: 16, components: 3 },
  vec4f: { size: 16, align: 16, components: 4 },
  vec4i: { size: 16, align: 16, components: 4 },
  vec4u: { size: 16, align: 16, components: 4 },
  mat3x3f: { size: 48, align: 16, components: 12 },
  mat4x4f: { size: 64, align: 16, components: 16 },
  // Aliases for convenience (GLSL-style names)
  float: { size: 4, align: 4, components: 1 },
  int: { size: 4, align: 4, components: 1 },
  uint: { size: 4, align: 4, components: 1 },
  vec2: { size: 8, align: 8, components: 2 },
  vec3: { size: 12, align: 16, components: 3 },
  vec4: { size: 16, align: 16, components: 4 },
};

function _alignTo(offset, alignment) {
  return Math.ceil(offset / alignment) * alignment;
}

// Compute layout for a set of uniform declarations.
// Returns { totalSize, fields: [{ name, type, offset, info }] }
export function computeUniformLayout(uniformsMeta) {
  const fields = [];
  let offset = 0;
  for (const [name, type] of Object.entries(uniformsMeta)) {
    const info = UNIFORM_TYPE_INFO[type];
    if (!info) throw new Error(`Unknown uniform type: ${type}`);
    offset = _alignTo(offset, info.align);
    fields.push({ name, type, offset, info });
    offset += info.size;
  }
  // Total size must be a multiple of 16 (WebGPU minUniformBufferOffsetAlignment)
  const totalSize = _alignTo(offset, 16);
  return { totalSize, fields };
}

// Pack uniform values into an ArrayBuffer according to a precomputed layout.
export function packUniforms(layout, values) {
  const buffer = new ArrayBuffer(layout.totalSize);
  const f32View = new Float32Array(buffer);
  const i32View = new Int32Array(buffer);
  const u32View = new Uint32Array(buffer);

  for (const field of layout.fields) {
    const val = values[field.name];
    if (val === undefined) continue;

    const byteOffset = field.offset / 4; // offset in 32-bit words
    const isInt = field.type === 'i32' || field.type === 'int' || field.type.endsWith('i');
    const isUint = field.type === 'u32' || field.type === 'uint' || field.type.endsWith('u');

    if (field.info.components === 1) {
      if (isInt) {
        i32View[byteOffset] = val;
      } else if (isUint) {
        u32View[byteOffset] = val;
      } else {
        f32View[byteOffset] = val;
      }
    } else {
      const arr = Array.isArray(val) ? val : [val];
      const view = isInt ? i32View : isUint ? u32View : f32View;
      for (let i = 0; i < field.info.components && i < arr.length; i++) {
        view[byteOffset + i] = arr[i];
      }
    }
  }

  return buffer;
}

// ─── RenderTarget ───────────────────────────────────────────────────────────

const DEFAULT_USAGE =
  GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC | GPUTextureUsage.COPY_DST;

export class RenderTarget {
  constructor(options = {}) {
    this.format = options.format || 'rgba8unorm';
    this._usage = options.usage || DEFAULT_USAGE;
    this._label = options.label || 'RenderTarget';
    this.texture = null;
    this.view = null;
    this.width = 0;
    this.height = 0;
    this._readback = null;
    this._readbackBusy = false;
  }

  setSize(w, h) {
    w = Math.max(1, Math.floor(w));
    h = Math.max(1, Math.floor(h));
    if (w === this.width && h === this.height && this.texture) return;
    this._destroy();
    this.width = w;
    this.height = h;
    this.texture = _device.createTexture({
      size: [w, h],
      format: this.format,
      usage: this._usage,
      label: this._label,
    });
    this.view = this.texture.createView();
  }

  uploadExternal(source) {
    if (!this.texture) throw new Error('RenderTarget not initialized — call setSize() first');
    performance.mark('gpu-upload-start');
    _queue.copyExternalImageToTexture({ source }, { texture: this.texture }, [this.width, this.height]);
    performance.mark('gpu-upload-end');
    try {
      performance.measure('gpu-upload:' + this._label, 'gpu-upload-start', 'gpu-upload-end');
    } catch (_) {}
  }

  uploadBytes(data, { bytesPerRow = this.width * 4 } = {}) {
    if (!this.texture) throw new Error('RenderTarget not initialized — call setSize() first');
    if (this.format !== 'rgba8unorm') {
      throw new Error(`uploadBytes only supports rgba8unorm targets, got ${this.format}`);
    }
    performance.mark('gpu-upload-start');
    _queue.writeTexture({ texture: this.texture }, data, { bytesPerRow }, [this.width, this.height]);
    performance.mark('gpu-upload-end');
    try {
      performance.measure('gpu-upload:' + this._label, 'gpu-upload-start', 'gpu-upload-end');
    } catch (_) {}
  }

  async readPixels() {
    const { width, height, data } = await this.readPixelsRaw();
    const imageData = new ImageData(width, height);
    imageData.data.set(data);
    return imageData;
  }

  async readPixelsRaw() {
    let readback;
    let temporary = false;
    if (!this._readbackBusy) {
      if (!this._readback) this._readback = createTextureReadback();
      readback = this._readback;
      this._readbackBusy = true;
    } else {
      readback = createTextureReadback();
      temporary = true;
    }
    try {
      const data = await readback.read(this);
      return { width: this.width, height: this.height, data };
    } finally {
      if (temporary) {
        readback.destroy();
      } else {
        this._readbackBusy = false;
      }
    }
  }

  _destroy() {
    this._readback?.destroy();
    this._readback = null;
    this._readbackBusy = false;
    if (this.texture) {
      this.texture.destroy();
      this.texture = null;
      this.view = null;
    }
  }

  destroy() {
    this._destroy();
    this.width = 0;
    this.height = 0;
  }
}

// ─── PingPongTarget ─────────────────────────────────────────────────────────

export class PingPongTarget {
  constructor(options = {}) {
    this.read = new RenderTarget(options);
    this.write = new RenderTarget(options);
    this.width = 0;
    this.height = 0;
    this._initialized = false;
  }

  setSize(w, h) {
    const resized = w !== this.width || h !== this.height;
    this.read.setSize(w, h);
    this.write.setSize(w, h);
    this.width = w;
    this.height = h;
    if (resized) {
      this._initialized = false;
    }
  }

  ensureInitialized(clearColor = { r: 0, g: 0, b: 0, a: 0 }) {
    if (this._initialized || !this.read.view || !this.write.view) return;
    clearRenderTarget(this.read, clearColor);
    clearRenderTarget(this.write, clearColor);
    this._initialized = true;
  }

  swap() {
    const tmp = this.read;
    this.read = this.write;
    this.write = tmp;
  }

  destroy() {
    this.read.destroy();
    this.write.destroy();
    this.width = 0;
    this.height = 0;
    this._initialized = false;
  }
}

// ─── Full-Screen Triangle Vertex Shader ─────────────────────────────────────

// UV origin is top-left: (0,0) at top-left, (1,1) at bottom-right.
const FULLSCREEN_VERTEX_WGSL = `
struct VertexOutput {
  @builtin(position) position: vec4f,
  @location(0) uv: vec2f,
};

@vertex
fn vs_main(@builtin(vertex_index) vi: u32) -> VertexOutput {
  // Full-screen triangle: 3 vertices, no index buffer
  var pos = array<vec2f, 3>(
    vec2f(-1.0, -1.0),
    vec2f( 3.0, -1.0),
    vec2f(-1.0,  3.0),
  );
  var out: VertexOutput;
  out.position = vec4f(pos[vi], 0.0, 1.0);
  // UV: top-left origin (0,0 at top-left)
  out.uv = vec2f(
    (pos[vi].x + 1.0) * 0.5,
    (1.0 - pos[vi].y) * 0.5,
  );
  return out;
}
`;

// ─── Pipeline Creation ──────────────────────────────────────────────────────

export function createRenderPipeline({
  wgsl,
  uniforms = {},
  textures = [],
  entryPoint = 'fs_main',
  sampler,
  targetFormat = 'rgba8unorm',
  label = '',
}) {
  const fullWgsl = FULLSCREEN_VERTEX_WGSL + '\n' + wgsl;
  const layout = computeUniformLayout(uniforms);

  const shaderModule = _device.createShaderModule({
    code: fullWgsl,
    label: label + ' shader',
  });

  // Build bind group layout entries
  const entries = [];
  let bindingIndex = 0;

  // Binding 0: Uniform buffer (always present, even if empty)
  entries.push({
    binding: bindingIndex++,
    visibility: GPUShaderStage.FRAGMENT | GPUShaderStage.VERTEX,
    buffer: { type: 'uniform' },
  });

  // Binding 1: Sampler
  entries.push({
    binding: bindingIndex++,
    visibility: GPUShaderStage.FRAGMENT,
    sampler: { type: 'filtering' },
  });

  // Binding 2+: Textures
  for (let i = 0; i < textures.length; i++) {
    entries.push({
      binding: bindingIndex++,
      visibility: GPUShaderStage.FRAGMENT,
      texture: { sampleType: 'float' },
    });
  }

  const bindGroupLayout = _device.createBindGroupLayout({ entries, label: label + ' bind group layout' });
  const pipelineLayout = _device.createPipelineLayout({
    bindGroupLayouts: [bindGroupLayout],
    label: label + ' pipeline layout',
  });

  const pipeline = _device.createRenderPipeline({
    layout: pipelineLayout,
    vertex: {
      module: shaderModule,
      entryPoint: 'vs_main',
    },
    fragment: {
      module: shaderModule,
      entryPoint,
      targets: [{ format: targetFormat }],
    },
    primitive: {
      topology: 'triangle-list',
    },
    label,
  });

  return {
    pipeline,
    bindGroupLayout,
    uniformLayout: layout,
    textureNames: textures,
    defaultSampler: sampler || samplers.linearClamp,
    targetFormat,
    label,
  };
}

export function createComputePipeline({ wgsl, uniforms = {}, textures = [], storage = [], entryPoint = 'cs_main', label = '' }) {
  const layout = computeUniformLayout(uniforms);

  const shaderModule = _device.createShaderModule({
    code: wgsl,
    label: label + ' compute shader',
  });

  const entries = [];
  let bindingIndex = 0;

  // Binding 0: Uniform buffer
  entries.push({
    binding: bindingIndex++,
    visibility: GPUShaderStage.COMPUTE,
    buffer: { type: 'uniform' },
  });

  // Textures
  for (let i = 0; i < textures.length; i++) {
    entries.push({
      binding: bindingIndex++,
      visibility: GPUShaderStage.COMPUTE,
      texture: { sampleType: 'float' },
    });
  }

  // Storage textures / buffers
  for (const s of storage) {
    if (s.type.startsWith('texture_storage_2d')) {
      const formatMatch = s.type.match(/<(\w+),\s*(\w+)>/);
      entries.push({
        binding: bindingIndex++,
        visibility: GPUShaderStage.COMPUTE,
        storageTexture: {
          access: formatMatch ? formatMatch[2] : 'write-only',
          format: formatMatch ? formatMatch[1] : 'rgba8unorm',
        },
      });
    } else {
      entries.push({
        binding: bindingIndex++,
        visibility: GPUShaderStage.COMPUTE,
        buffer: { type: 'storage' },
      });
    }
  }

  const bindGroupLayout = _device.createBindGroupLayout({ entries, label: label + ' compute bind group layout' });
  const pipelineLayout = _device.createPipelineLayout({
    bindGroupLayouts: [bindGroupLayout],
    label: label + ' compute pipeline layout',
  });

  const pipeline = _device.createComputePipeline({
    layout: pipelineLayout,
    compute: {
      module: shaderModule,
      entryPoint,
    },
    label,
  });

  return {
    pipeline,
    bindGroupLayout,
    uniformLayout: layout,
    textureNames: textures,
    storageNames: storage.map((s) => s.name),
    label,
  };
}

// ─── Drawing ────────────────────────────────────────────────────────────────

export function drawFullscreen(pipelineInfo, uniformValues, textureValues, target, options = {}) {
  if (!_device || !target || !target.view) return;
  performance.mark('gpu-draw-start-' + pipelineInfo.label);

  const { sampler: overrideSampler, clearColor } = options;
  const activeSampler = overrideSampler || pipelineInfo.defaultSampler;

  // Pack uniforms into a GPU buffer
  const uniformData = packUniforms(pipelineInfo.uniformLayout, uniformValues);
  const uniformBuffer = _device.createBuffer({
    size: uniformData.byteLength || 16, // minimum 16 bytes
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    label: pipelineInfo.label + ' uniforms',
  });
  _queue.writeBuffer(uniformBuffer, 0, uniformData);

  // Build bind group entries
  const bgEntries = [
    { binding: 0, resource: { buffer: uniformBuffer } },
    { binding: 1, resource: activeSampler },
  ];

  let bindingIndex = 2;
  for (const texName of pipelineInfo.textureNames) {
    const rt = textureValues[texName];
    if (rt && rt.view) {
      bgEntries.push({ binding: bindingIndex++, resource: rt.view });
    } else if (rt && rt.createView) {
      // Raw GPUTexture passed
      bgEntries.push({ binding: bindingIndex++, resource: rt.createView() });
    } else {
      // Null texture — use cached 1x1 placeholder view
      _createPlaceholderTexture();
      bgEntries.push({ binding: bindingIndex++, resource: _placeholderTextureView });
    }
  }

  const bindGroup = _device.createBindGroup({
    layout: pipelineInfo.bindGroupLayout,
    entries: bgEntries,
    label: pipelineInfo.label + ' bind group',
  });

  const encoder = _device.createCommandEncoder({ label: pipelineInfo.label + ' encoder' });

  const loadOp = clearColor ? 'clear' : 'load';
  const colorAttachment = {
    view: target.view,
    loadOp,
    storeOp: 'store',
    clearValue: clearColor || { r: 0, g: 0, b: 0, a: 0 },
  };

  const pass = encoder.beginRenderPass({
    colorAttachments: [colorAttachment],
    label: pipelineInfo.label + ' render pass',
  });

  pass.setPipeline(pipelineInfo.pipeline);
  pass.setBindGroup(0, bindGroup);
  pass.draw(3); // full-screen triangle
  pass.end();

  _queue.submit([encoder.finish()]);
  uniformBuffer.destroy();
  performance.mark('gpu-draw-end-' + pipelineInfo.label);
  try {
    performance.measure('gpu-draw:' + pipelineInfo.label, 'gpu-draw-start-' + pipelineInfo.label, 'gpu-draw-end-' + pipelineInfo.label);
  } catch (_) {}
}

export function dispatch(pipelineInfo, uniformValues, resources, workgroups) {
  if (!_device) return;

  const uniformData = packUniforms(pipelineInfo.uniformLayout, uniformValues);
  const uniformBuffer = _device.createBuffer({
    size: uniformData.byteLength || 16,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    label: pipelineInfo.label + ' compute uniforms',
  });
  _queue.writeBuffer(uniformBuffer, 0, uniformData);

  const bgEntries = [{ binding: 0, resource: { buffer: uniformBuffer } }];

  let bindingIndex = 1;
  for (const texName of pipelineInfo.textureNames) {
    const rt = resources[texName];
    bgEntries.push({ binding: bindingIndex++, resource: rt.view || rt.createView() });
  }
  for (const storageName of pipelineInfo.storageNames) {
    const res = resources[storageName];
    if (res.view || res.createView) {
      bgEntries.push({ binding: bindingIndex++, resource: res.view || res.createView() });
    } else {
      bgEntries.push({ binding: bindingIndex++, resource: { buffer: res } });
    }
  }

  const bindGroup = _device.createBindGroup({
    layout: pipelineInfo.bindGroupLayout,
    entries: bgEntries,
    label: pipelineInfo.label + ' compute bind group',
  });

  const encoder = _device.createCommandEncoder({ label: pipelineInfo.label + ' compute encoder' });
  const pass = encoder.beginComputePass({ label: pipelineInfo.label + ' compute pass' });
  pass.setPipeline(pipelineInfo.pipeline);
  pass.setBindGroup(0, bindGroup);
  pass.dispatchWorkgroups(...workgroups);
  pass.end();

  _queue.submit([encoder.finish()]);
  uniformBuffer.destroy();
}

export function beginRenderPass(encoder, target, options = {}) {
  const { clearColor } = options;
  return encoder.beginRenderPass({
    colorAttachments: [
      {
        view: target.view,
        loadOp: clearColor ? 'clear' : 'load',
        storeOp: 'store',
        clearValue: clearColor || { r: 0, g: 0, b: 0, a: 0 },
      },
    ],
  });
}

export function clearRenderTarget(target, clearColor = { r: 0, g: 0, b: 0, a: 0 }) {
  if (!_device || !target || !target.view) return;
  const encoder = _device.createCommandEncoder({ label: (target._label || 'target') + ' clear encoder' });
  const pass = encoder.beginRenderPass({
    colorAttachments: [
      {
        view: target.view,
        loadOp: 'clear',
        storeOp: 'store',
        clearValue: clearColor,
      },
    ],
  });
  pass.end();
  _queue.submit([encoder.finish()]);
}

// ─── Readback ───────────────────────────────────────────────────────────────

export function createTextureReadback() {
  let stagingBuffer = null;
  let scratch = null;
  let bytesPerRow = 0;
  let bufferSize = 0;

  function ensureCapacity(width, height) {
    const nextBytesPerRow = Math.ceil((width * 4) / 256) * 256;
    const nextBufferSize = nextBytesPerRow * height;
    const nextScratchSize = width * height * 4;

    if (!stagingBuffer || nextBufferSize !== bufferSize) {
      stagingBuffer?.destroy();
      stagingBuffer = _device.createBuffer({
        size: nextBufferSize,
        usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
        label: 'readback staging',
      });
      bytesPerRow = nextBytesPerRow;
      bufferSize = nextBufferSize;
    }

    if (!scratch || scratch.length !== nextScratchSize) {
      scratch = new Uint8Array(nextScratchSize);
    }
  }

  return {
    async read(target, destination = null) {
      performance.mark('gpu-readback-start');
      const { texture, width, height } = target;
      ensureCapacity(width, height);

      const encoder = _device.createCommandEncoder({ label: 'readback encoder' });
      encoder.copyTextureToBuffer({ texture }, { buffer: stagingBuffer, bytesPerRow }, [width, height]);
      _queue.submit([encoder.finish()]);

      await stagingBuffer.mapAsync(GPUMapMode.READ);
      const data = new Uint8Array(stagingBuffer.getMappedRange());

      const rowBytes = width * 4;
      let output = destination;
      if (!output || output.length !== scratch.length) {
        output = scratch;
      }
      for (let y = 0; y < height; y++) {
        const srcOffset = y * bytesPerRow;
        const dstOffset = y * rowBytes;
        output.set(data.subarray(srcOffset, srcOffset + rowBytes), dstOffset);
      }

      stagingBuffer.unmap();
      performance.mark('gpu-readback-end');
      try {
        performance.measure('gpu-readback', 'gpu-readback-start', 'gpu-readback-end');
      } catch (_) {}
      return output;
    },
    destroy() {
      stagingBuffer?.destroy();
      stagingBuffer = null;
      scratch = null;
      bytesPerRow = 0;
      bufferSize = 0;
    },
  };
}

// ─── Placeholder Texture ────────────────────────────────────────────────────

let _placeholderTexture = null;
let _placeholderTextureView = null;

function _createPlaceholderTexture() {
  if (_placeholderTexture) return _placeholderTexture;
  _placeholderTexture = _device.createTexture({
    size: [1, 1],
    format: 'rgba8unorm',
    usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
    label: 'placeholder 1x1',
  });
  _placeholderTextureView = _placeholderTexture.createView();
  _queue.writeTexture({ texture: _placeholderTexture }, new Uint8Array([0, 0, 0, 255]), { bytesPerRow: 4 }, [1, 1]);
  return _placeholderTexture;
}

// ─── Utility: Load Image to RenderTarget ────────────────────────────────────

export async function loadImageToTarget(url) {
  const response = await fetch(url);
  const blob = await response.blob();
  const bitmap = await createImageBitmap(blob);
  const target = new RenderTarget({ label: 'loaded image' });
  target.setSize(bitmap.width, bitmap.height);
  target.uploadExternal(bitmap);
  bitmap.close();
  return target;
}

// ─── Node Authoring Helpers ──────────────────────────────────────────────────

const _WGSL_TYPE_ALIASES = {
  float: 'f32',
  int: 'i32',
  uint: 'u32',
  vec2: 'vec2f',
  vec3: 'vec3f',
  vec4: 'vec4f',
  mat3: 'mat3x3f',
  mat4: 'mat4x4f',
};

function _canonicalWgslType(type) {
  return _WGSL_TYPE_ALIASES[type] || type;
}

export function generateWgslPreamble({ uniforms = {}, textures = [] }) {
  // Normalize types
  const normalized = {};
  for (const [name, type] of Object.entries(uniforms)) {
    normalized[name] = _canonicalWgslType(type);
  }

  const layout = computeUniformLayout(normalized);
  let structBody = '';
  let padIndex = 0;
  let cursor = 0;

  if (layout.fields.length === 0) {
    structBody = '  _pad0: f32,';
  } else {
    for (const field of layout.fields) {
      // Emit padding for gaps
      while (cursor < field.offset) {
        structBody += `  _pad${padIndex}: f32,\n`;
        padIndex++;
        cursor += 4;
      }
      structBody += `  ${field.name}: ${field.type},\n`;
      cursor = field.offset + field.info.size;
    }
    // Trailing padding to reach totalSize
    while (cursor < layout.totalSize) {
      structBody += `  _pad${padIndex}: f32,\n`;
      padIndex++;
      cursor += 4;
    }
  }

  let wgsl = `struct Uniforms {\n${structBody}};\n`;
  wgsl += `@group(0) @binding(0) var<uniform> u: Uniforms;\n`;
  wgsl += `@group(0) @binding(1) var defaultSampler: sampler;\n`;
  for (let i = 0; i < textures.length; i++) {
    wgsl += `@group(0) @binding(${2 + i}) var ${textures[i]}: texture_2d<f32>;\n`;
  }
  return wgsl;
}

function _buildFragmentWgsl(preamble, wgsl) {
  if (wgsl.includes('@fragment')) {
    return preamble + '\n' + wgsl;
  }
  return preamble + '\n@fragment\nfn fs_main(in: VertexOutput) -> @location(0) vec4f {\n' + wgsl + '\n}\n';
}

export function createImageFilter(node, opts) {
  const { label, wgsl, uniforms = {}, getUniforms, input = 'in', output = 'out', sampler } = opts;

  const inputPort = node.imageIn(input);
  const outputPort = node.imageOut(output);
  const textureNames = ['u_input_texture'];

  const result = { pipeline: null, target: null, inputPort, outputPort };

  node.onStart = () => {
    const normalized = {};
    for (const [n, t] of Object.entries(uniforms)) normalized[n] = _canonicalWgslType(t);
    const preamble = generateWgslPreamble({ uniforms: normalized, textures: textureNames });
    const fullWgsl = _buildFragmentWgsl(preamble, wgsl);
    result.pipeline = createRenderPipeline({ wgsl: fullWgsl, uniforms: normalized, textures: textureNames, label, sampler });
    result.target = new RenderTarget({ label });
  };

  node.onRender = () => {
    const img = inputPort.value;
    if (!img) return;
    result.target.setSize(img.width, img.height);
    drawFullscreen(result.pipeline, getUniforms ? getUniforms() : {}, { u_input_texture: img }, result.target);
    outputPort.set(result.target);
  };

  node.onStop = () => {
    result.target?.destroy();
  };

  return result;
}

export function createImageGenerator(node, opts) {
  const { label, wgsl, uniforms = {}, getUniforms, getSize, output = 'out', sampler } = opts;

  const outputPort = node.imageOut(output);

  const result = { pipeline: null, target: null, outputPort };

  node.onStart = () => {
    const normalized = {};
    for (const [n, t] of Object.entries(uniforms)) normalized[n] = _canonicalWgslType(t);
    const preamble = generateWgslPreamble({ uniforms: normalized, textures: [] });
    const fullWgsl = _buildFragmentWgsl(preamble, wgsl);
    result.pipeline = createRenderPipeline({ wgsl: fullWgsl, uniforms: normalized, textures: [], label, sampler });
    result.target = new RenderTarget({ label });
  };

  node.onRender = () => {
    const size = getSize();
    result.target.setSize(size.width, size.height);
    drawFullscreen(result.pipeline, getUniforms ? getUniforms() : {}, {}, result.target);
    outputPort.set(result.target);
  };

  node.onStop = () => {
    result.target?.destroy();
  };

  return result;
}

export function createFeedbackFilter(node, opts) {
  const { label, wgsl, uniforms = {}, textures = [], getUniforms, iterations = 1, input = 'in', output = 'out', sampler } = opts;

  const inputPort = node.imageIn(input);
  const outputPort = node.imageOut(output);
  // Texture order: u_feedback_texture, u_input_texture, ...extra
  const allTextures = ['u_feedback_texture', 'u_input_texture', ...textures];

  const result = { pipeline: null, pp: null, inputPort, outputPort };

  node.onStart = () => {
    const normalized = {};
    for (const [n, t] of Object.entries(uniforms)) normalized[n] = _canonicalWgslType(t);
    const preamble = generateWgslPreamble({ uniforms: normalized, textures: allTextures });
    const fullWgsl = _buildFragmentWgsl(preamble, wgsl);
    result.pipeline = createRenderPipeline({ wgsl: fullWgsl, uniforms: normalized, textures: allTextures, label, sampler });
    result.pp = new PingPongTarget({ label });
  };

  node.onRender = () => {
    const img = inputPort.value;
    if (!img) return;
    result.pp.setSize(img.width, img.height);
    result.pp.ensureInitialized();

    const uniformValues = getUniforms ? getUniforms() : {};
    const iterCount = typeof iterations === 'function' ? iterations() : iterations;

    for (let i = 0; i < iterCount; i++) {
      const texValues = { u_feedback_texture: result.pp.read, u_input_texture: img };
      for (const t of textures) texValues[t] = texValues[t]; // extra textures filled by getUniforms if needed
      drawFullscreen(result.pipeline, uniformValues, texValues, result.pp.write, { clearColor: { r: 0, g: 0, b: 0, a: 0 } });
      result.pp.swap();
    }

    outputPort.set(result.pp.read);
  };

  node.onStop = () => {
    result.pp?.destroy();
  };

  return result;
}

// ─── Non-GPU Utilities (preserved from original) ────────────────────────────

try {
  window.audioCtx = new AudioContext();
} catch (err) {
  console.error('Failed to create AudioContext:', err);
}

export function projectFile() {
  if (!window.app) return '';
  const state = window.app.getState();
  if (!state.filePath) return '';
  return state.filePath;
}

export function projectDirectory() {
  if (!window.app) return '';
  const state = window.app.getState();
  if (!state.filePath) return '';
  return nodePath.dirname(state.filePath);
}

export function ensureDirectory(dir) {
  if (!window.app) return;
  return window.desktop.ensureDirectory(dir);
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

export function toCanvasColor(color) {
  return `rgba(${color[0]}, ${color[1]}, ${color[2]}, ${color[3]})`;
}

export function colorToVec4(color) {
  return [color[0] / 255, color[1] / 255, color[2] / 255, color[3]];
}

export function colorToVec3(color) {
  return [color[0] / 255, color[1] / 255, color[2] / 255];
}
