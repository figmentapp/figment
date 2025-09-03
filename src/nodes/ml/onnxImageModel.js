/**
 * @name ONNX Image Model
 * @description Run a generative image-to-image model using ONNX
 * @category ml
 */

const imageIn = node.imageIn('in');
const modelFileIn = node.fileIn('model');
const imageOut = node.imageOut('out');

// Fixed model/input size for now (matches original node).
const WIDTH = 512;
const HEIGHT = 512;
const PLANE_SIZE = WIDTH * HEIGHT;
const INPUT_BUFFER_SIZE = 3 * PLANE_SIZE * 4; // float32
const OUTPUT_BUFFER_SIZE = 3 * PLANE_SIZE * 4; // float32
const RGBA_BUFFER_SIZE = PLANE_SIZE * 4; // u8 bytes

let oldModelFile;
let session;
let device;
let target; // WebGPU RenderTarget for the node output
let inputName, outputName; // resolved model I/O names
let detectedLayoutCode = 0; // 0=NCHW, 1=NHWC

// ONNX GPU buffers and tensors
let inputBuffer, outputBuffer, inputTensor, outputTensor;

// Intermediate GPU buffer to pack floats into RGBA8 for copy to texture
let rgbaPackedBuffer;

// Compute pipelines and bind group layouts
let packPipeline, unpackPipeline, fillPipeline;
let packBindGroupLayout, unpackBindGroupLayout;

// Uniform buffer for width/height/layout/range (aligned to 16 bytes)
let paramsBuffer;

// Optional debug readback buffer (guarded by window.DEBUG_ONNX_NODE)
let debugReadBuffer;
let didInputDebug = false;
let didOutputDebug = false;
const DEBUG_SAMPLE_FLOATS = 4096; // number of floats to sample from buffer start

// WGSL compute shader to convert input RGBA texture -> NCHW float buffer in [-1, 1].
const PACK_WGSL = `
struct Params { width: u32, height: u32, layoutCode: u32, rangeCode: u32 };
@group(0) @binding(0) var inputTex: texture_2d<f32>;
@group(0) @binding(1) var<storage, read_write> outBuf: array<f32>;
@group(0) @binding(2) var<uniform> params: Params;

@compute @workgroup_size(16, 16, 1)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
  let dims = textureDimensions(inputTex);
  let w = dims.x;
  let h = dims.y;
  let x = gid.x;
  let y = gid.y;
  if (x >= w || y >= h) { return; }

  let rgba = textureLoad(inputTex, vec2<i32>(i32(x), i32(y)), 0);
  let base = y * w + x;
  let plane = w * h;
  var r = rgba.r;
  var g = rgba.g;
  var b = rgba.b;
  if (params.rangeCode == 0u) { // -1..1
    r = r * 2.0 - 1.0;
    g = g * 2.0 - 1.0;
    b = b * 2.0 - 1.0;
  }
  if (params.layoutCode == 0u) {
    // NCHW
    outBuf[base] = r;
    outBuf[plane + base] = g;
    outBuf[plane * 2u + base] = b;
  } else {
    // NHWC
    let idx = base * 3u;
    outBuf[idx + 0u] = r;
    outBuf[idx + 1u] = g;
    outBuf[idx + 2u] = b;
  }
}
`;

// WGSL compute shader to convert NCHW float buffer in [-1,1] -> packed RGBA8 bytes in a u32 buffer.
const UNPACK_WGSL = `
struct Params { width: u32, height: u32, layoutCode: u32, rangeCode: u32 };
@group(0) @binding(0) var<storage, read> inBuf: array<f32>;
@group(0) @binding(1) var<storage, read_write> outRGBA: array<u32>;
@group(0) @binding(2) var<uniform> params: Params;

fn clamp01(v: f32) -> f32 { return max(0.0, min(1.0, v)); }

@compute @workgroup_size(16, 16, 1)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
  let w = params.width;
  let h = params.height;
  let x = gid.x;
  let y = gid.y;
  if (x >= w || y >= h) { return; }

  let base = y * w + x;
  let plane = w * h;
  var r: f32;
  var g: f32;
  var b: f32;
  if (params.layoutCode == 0u) {
    // NCHW
    r = inBuf[base];
    g = inBuf[plane + base];
    b = inBuf[plane * 2u + base];
  } else {
    // NHWC
    let idx = base * 3u;
    r = inBuf[idx + 0u];
    g = inBuf[idx + 1u];
    b = inBuf[idx + 2u];
  }
  if (params.rangeCode == 0u) { // -1..1
    r = r * 0.5 + 0.5;
    g = g * 0.5 + 0.5;
    b = b * 0.5 + 0.5;
  }
  r = clamp01(r);
  g = clamp01(g);
  b = clamp01(b);

  let R: u32 = u32(round(r * 255.0));
  let G: u32 = u32(round(g * 255.0));
  let B: u32 = u32(round(b * 255.0));
  let A: u32 = 255u;
  // Little-endian: lowest 8 bits first (R, G, B, A)
  outRGBA[base] = (R) | (G << 8u) | (B << 16u) | (A << 24u);
}
`;

// Optional debug shader: fill input buffer with a known pattern (R=1,G=0,B=0)
const FILL_WGSL = `
struct Params { width: u32, height: u32, layoutCode: u32, rangeCode: u32 };
@group(0) @binding(0) var<storage, read_write> outBuf: array<f32>;
@group(0) @binding(1) var<uniform> params: Params;

@compute @workgroup_size(16, 16, 1)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
  let w = params.width;
  let h = params.height;
  let x = gid.x;
  let y = gid.y;
  if (x >= w || y >= h) { return; }
  let base = y * w + x;
  let plane = w * h;
  if (params.layoutCode == 0u) {
    // NCHW
    outBuf[base] = 1.0;
    outBuf[plane + base] = 0.0;
    outBuf[plane * 2u + base] = 0.0;
  } else {
    // NHWC
    let idx = base * 3u;
    outBuf[idx + 0u] = 1.0;
    outBuf[idx + 1u] = 0.0;
    outBuf[idx + 2u] = 0.0;
  }
}
`;

function ensureDevice() {
  if (!window._gpu || !window._gpu.device) throw new Error('WebGPU device not initialized.');
  device = window._gpu.device;
  // Ensure ONNX Runtime uses the exact same device/adapter.
  try {
    if (typeof ort !== 'undefined' && ort?.env?.webgpu) {
      ort.env.webgpu.adapter = window._gpu.adapter || ort.env.webgpu.adapter;
      ort.env.webgpu.device = window._gpu.device;
    }
  } catch {}
}

function ensurePipelines() {
  if (packPipeline && unpackPipeline && paramsBuffer) return;

  // Params buffer with width/height (must be 16-byte aligned size)
  const params = new Uint32Array(4);
  params[0] = WIDTH;
  params[1] = HEIGHT;
  params[2] = 0; // layoutCode: 0=NCHW,1=NHWC
  params[3] = 0; // rangeCode: 0=-1..1,1=0..1
  paramsBuffer = device.createBuffer({ size: 16, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
  device.queue.writeBuffer(paramsBuffer, 0, params.buffer, params.byteOffset, params.byteLength);

  // Create compute pipelines
  const packModule = device.createShaderModule({ code: PACK_WGSL });
  const unpackModule = device.createShaderModule({ code: UNPACK_WGSL });
  const fillModule = device.createShaderModule({ code: FILL_WGSL });

  packPipeline = device.createComputePipeline({
    layout: 'auto',
    compute: { module: packModule, entryPoint: 'main' },
  });
  unpackPipeline = device.createComputePipeline({
    layout: 'auto',
    compute: { module: unpackModule, entryPoint: 'main' },
  });
  fillPipeline = device.createComputePipeline({
    layout: 'auto',
    compute: { module: fillModule, entryPoint: 'main' },
  });
}

function ensureBuffers() {
  if (!inputBuffer)
    inputBuffer = device.createBuffer({
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC,
      size: INPUT_BUFFER_SIZE,
    });
  if (!outputBuffer)
    outputBuffer = device.createBuffer({ usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC, size: OUTPUT_BUFFER_SIZE });
  if (!rgbaPackedBuffer)
    rgbaPackedBuffer = device.createBuffer({ usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC, size: RGBA_BUFFER_SIZE });
}

async function loadModel() {
  if (!modelFileIn.value) return;
  ensureDevice();
  ensurePipelines();
  ensureBuffers();

  const modelUrl = figment.urlForAsset(modelFileIn.value);
  try {
    ort.env.webgpu.powerPreference = 'high-performance';
    // prefer outputs to remain on GPU
    session = await ort.InferenceSession.create(modelUrl, {
      executionProviders: [{ name: 'webgpu', preferredLayout: 'NCHW' }],
      // enableGraphCapture: true,
      preferredOutputLocation: 'gpu-buffer',
    });
    // Resolve model I/O names from the session
    inputName = session.inputNames?.[0] || 'input';
    outputName = session.outputNames?.[0] || 'output';
    try {
      console.log('ONNX I/O:', session.inputNames, session.outputNames);
      console.log('ONNX inputMetadata:', session.inputMetadata);
      console.log('ONNX outputMetadata:', session.outputMetadata);
    } catch {}

    // Detect expected layout from input metadata shape
    // Prefer: NCHW if shape[1] === 3; NHWC if shape[3] === 3; fallback NCHW
    detectedLayoutCode = 0;
    try {
      const meta = session.inputMetadata?.[0];
      const shape = meta?.isTensor ? meta.shape : undefined;
      if (Array.isArray(shape) && shape.length === 4) {
        if (shape[1] === 3)
          detectedLayoutCode = 0; // NCHW
        else if (shape[3] === 3) detectedLayoutCode = 1; // NHWC
      }
      console.log('Detected layout:', detectedLayoutCode === 0 ? 'NCHW' : 'NHWC');
    } catch {}

    // Create ONNX tensors bound to our GPU buffers with detected layout dims
    if (detectedLayoutCode === 0) {
      inputTensor = ort.Tensor.fromGpuBuffer(inputBuffer, { dataType: 'float32', dims: [1, 3, HEIGHT, WIDTH] });
      outputTensor = ort.Tensor.fromGpuBuffer(outputBuffer, { dataType: 'float32', dims: [1, 3, HEIGHT, WIDTH] });
    } else {
      inputTensor = ort.Tensor.fromGpuBuffer(inputBuffer, { dataType: 'float32', dims: [1, HEIGHT, WIDTH, 3] });
      outputTensor = ort.Tensor.fromGpuBuffer(outputBuffer, { dataType: 'float32', dims: [1, HEIGHT, WIDTH, 3] });
    }
    oldModelFile = modelFileIn.value;
  } catch (e) {
    console.error('Failed to load ONNX model:', e);
  }
}

let isRunning = false;

function updateParamsBuffer() {
  const params = new Uint32Array(4);
  const w = imageIn.value?.width || WIDTH;
  const h = imageIn.value?.height || HEIGHT;
  params[0] = w;
  params[1] = h;
  params[2] = detectedLayoutCode; // layoutCode
  params[3] = 0; // rangeCode (-1..1)
  device.queue.writeBuffer(paramsBuffer, 0, params.buffer, params.byteOffset, params.byteLength);
}

node.onStart = async () => {
  ensureDevice();
  target = new figment.RenderTarget();
  target.setSize(WIDTH, HEIGHT);
};

node.onRender = async () => {
  if (isRunning) return;
  if (oldModelFile !== modelFileIn.value) {
    isRunning = true;
    await loadModel();
    isRunning = false;
  }
  if (!session) return;
  if (!imageIn.value || !imageIn.value.view) return;
  if (imageIn.value.width !== WIDTH || imageIn.value.height !== HEIGHT) {
    throw new Error('Image must be 512x512');
  }

  isRunning = true;

  console.log('onnx frame');

  // Ensure params buffer reflects detected layout/range
  updateParamsBuffer();

  // Ensure output target matches current input size
  try {
    const iw = imageIn.value.width || WIDTH;
    const ih = imageIn.value.height || HEIGHT;
    if (target.width !== iw || target.height !== ih) {
      target.setSize(iw, ih);
    }
  } catch {}

  // 1) Pack input texture -> model input buffer on GPU (or fill debug pattern)
  const encoder1 = device.createCommandEncoder();
  const pass1 = encoder1.beginComputePass();
  if (window.DEBUG_ONNX_NODE_FILL) {
    pass1.setPipeline(fillPipeline);
    const fillBG = device.createBindGroup({
      layout: fillPipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: inputBuffer } },
        { binding: 1, resource: { buffer: paramsBuffer } },
      ],
    });
    pass1.setBindGroup(0, fillBG);
  } else {
    pass1.setPipeline(packPipeline);
    const packBindGroup = device.createBindGroup({
      layout: packPipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: imageIn.value.view },
        { binding: 1, resource: { buffer: inputBuffer } },
        { binding: 2, resource: { buffer: paramsBuffer } },
      ],
    });
    pass1.setBindGroup(0, packBindGroup);
  }
  const wgroupsX = Math.ceil((imageIn.value.width || WIDTH) / 16);
  const wgroupsY = Math.ceil((imageIn.value.height || HEIGHT) / 16);
  pass1.dispatchWorkgroups(wgroupsX, wgroupsY, 1);
  pass1.end();
  device.queue.submit([encoder1.finish()]);

  // Optional: debug-log packed input range once
  if (window.DEBUG_ONNX_NODE && !didInputDebug) {
    const sampleBytes = DEBUG_SAMPLE_FLOATS * 4;
    if (!debugReadBuffer || debugReadBuffer.size < sampleBytes) {
      debugReadBuffer?.destroy?.();
      debugReadBuffer = device.createBuffer({ size: sampleBytes, usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST });
    }
    const dbgEnc = device.createCommandEncoder();
    dbgEnc.copyBufferToBuffer(inputBuffer, 0, debugReadBuffer, 0, sampleBytes);
    device.queue.submit([dbgEnc.finish()]);
    try {
      await debugReadBuffer.mapAsync(GPUMapMode.READ, 0, sampleBytes);
      const range = debugReadBuffer.getMappedRange(0, sampleBytes);
      const f = new Float32Array(range.slice(0));
      let min = Infinity,
        max = -Infinity;
      for (let i = 0; i < f.length; i++) {
        const v = f[i];
        if (v < min) min = v;
        if (v > max) max = v;
      }
      console.log('Packed input sample min/max:', min, max, 'first8:', Array.from(f.slice(0, 8)));
      debugReadBuffer.unmap();
      didInputDebug = true;
    } catch {}
  }

  // 2) Run inference entirely on GPU using our pre-allocated output buffer
  let outGpuBuffer = outputBuffer;
  if (window.DEBUG_BYPASS_ORT) {
    outGpuBuffer = inputBuffer; // visualize packed input directly through unpack
  } else {
    await session.run({ [inputName]: inputTensor }, { [outputName]: outputTensor }, { preferredOutputLocation: 'gpu-buffer' });
  }
  // Ensure GPU work from ORT is completed before unpack
  try {
    await device.queue.onSubmittedWorkDone();
  } catch {}

  // Optional: debug-log model output range once
  if (window.DEBUG_ONNX_NODE && !didOutputDebug) {
    const sampleBytes = DEBUG_SAMPLE_FLOATS * 4;
    if (!debugReadBuffer || debugReadBuffer.size < sampleBytes) {
      debugReadBuffer?.destroy?.();
      debugReadBuffer = device.createBuffer({ size: sampleBytes, usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST });
    }
    const dbgEnc2 = device.createCommandEncoder();
    dbgEnc2.copyBufferToBuffer(outGpuBuffer, 0, debugReadBuffer, 0, sampleBytes);
    device.queue.submit([dbgEnc2.finish()]);
    try {
      await debugReadBuffer.mapAsync(GPUMapMode.READ, 0, sampleBytes);
      const range = debugReadBuffer.getMappedRange(0, sampleBytes);
      const f = new Float32Array(range.slice(0));
      let min = Infinity,
        max = -Infinity;
      for (let i = 0; i < f.length; i++) {
        const v = f[i];
        if (v < min) min = v;
        if (v > max) max = v;
      }
      console.log('Model output sample min/max:', min, max, 'first8:', Array.from(f.slice(0, 8)));
      debugReadBuffer.unmap();
      didOutputDebug = true;
    } catch {}
  }

  // 3) Unpack NCHW float buffer -> RGBA8 (u32-packed) buffer
  const encoder2 = device.createCommandEncoder();
  const pass2 = encoder2.beginComputePass();
  pass2.setPipeline(unpackPipeline);
  const unpackBindGroup = device.createBindGroup({
    layout: unpackPipeline.getBindGroupLayout(0),
    entries: [
      { binding: 0, resource: { buffer: outGpuBuffer } },
      { binding: 1, resource: { buffer: rgbaPackedBuffer } },
      { binding: 2, resource: { buffer: paramsBuffer } },
    ],
  });
  pass2.setBindGroup(0, unpackBindGroup);
  const uw = imageIn.value.width || WIDTH;
  const uh = imageIn.value.height || HEIGHT;
  pass2.dispatchWorkgroups(Math.ceil(uw / 16), Math.ceil(uh / 16), 1);
  pass2.end();

  // Copy packed RGBA bytes into the node's RenderTarget texture
  encoder2.copyBufferToTexture(
    { buffer: rgbaPackedBuffer, offset: 0, bytesPerRow: uw * 4, rowsPerImage: uh },
    { texture: target.texture },
    { width: uw, height: uh, depthOrArrayLayers: 1 },
  );
  device.queue.submit([encoder2.finish()]);

  imageOut.set(target);
  isRunning = false;
};
