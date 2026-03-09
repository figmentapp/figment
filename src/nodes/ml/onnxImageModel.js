/**
 * @name ONNX Image Model
 * @description Run a generative image to image model using ONNX Runtime Web
 * @category ml
 */

const imageIn = node.imageIn('in');
const modelFileIn = node.fileIn('model');
const imageOut = node.imageOut('out');
let oldModelFile,
  session,
  device,
  target,
  inputReadback,
  isRunning = false;
const IMAGE_WIDTH = 512;
const IMAGE_HEIGHT = 512;
const PIXEL_COUNT = IMAGE_WIDTH * IMAGE_HEIGHT;
const RGBA_SIZE = 4 * PIXEL_COUNT;
const BUFFER_SIZE = 3 * PIXEL_COUNT * 4;
let inputBuffer, outputBuffer, inputTensor, outputTensor;
let rgbaBuffer, convertInputPipeline, convertOutputPipeline, convertInputBindGroup, convertOutputBindGroup;
let bridgeCanvas, bridgeCtx, bridgeTexture, bridgeTextureView, bridgeRenderPipeline, bridgeSampler, bridgeBindGroupLayout, bridgeBindGroup;
let profileSequence = 0;

// WGSL compute shader: RGBA (uint8) → NCHW (float32) with normalization
const rgbaToNchwShader = `
@group(0) @binding(0) var<storage, read> inputRGBA: array<u32>;
@group(0) @binding(1) var<storage, read_write> outputNCHW: array<f32>;

@compute @workgroup_size(16, 16)
fn main(@builtin(global_invocation_id) global_id: vec3<u32>) {
  let width = ${IMAGE_WIDTH}u;
  let height = ${IMAGE_HEIGHT}u;
  let x = global_id.x;
  let y = global_id.y;

  if (x >= width || y >= height) {
    return;
  }

  let pixelIndex = y * width + x;
  let pixelCount = width * height;

  // Unpack RGBA from u32 (assumes little-endian: ABGR in memory)
  let packedPixel = inputRGBA[pixelIndex];
  let r = f32(packedPixel & 0xFFu);
  let g = f32((packedPixel >> 8u) & 0xFFu);
  let b = f32((packedPixel >> 16u) & 0xFFu);

  // Normalize from [0, 255] to [-1, 1]
  let rNorm = r / 127.5 - 1.0;
  let gNorm = g / 127.5 - 1.0;
  let bNorm = b / 127.5 - 1.0;

  // Write to NCHW format (planar: all R, then all G, then all B)
  outputNCHW[pixelIndex] = rNorm;
  outputNCHW[pixelCount + pixelIndex] = gNorm;
  outputNCHW[pixelCount * 2u + pixelIndex] = bNorm;
}
`;

// WGSL compute shader: NCHW (float32) → RGBA storage texture with denormalization
const nchwToRgbaShader = `
@group(0) @binding(0) var<storage, read> inputNCHW: array<f32>;
@group(0) @binding(1) var outputRGBA: texture_storage_2d<rgba8unorm, write>;

@compute @workgroup_size(16, 16)
fn main(@builtin(global_invocation_id) global_id: vec3<u32>) {
  let width = ${IMAGE_WIDTH}u;
  let height = ${IMAGE_HEIGHT}u;
  let x = global_id.x;
  let y = global_id.y;

  if (x >= width || y >= height) {
    return;
  }

  let pixelIndex = y * width + x;
  let pixelCount = width * height;

  // Read from NCHW format (planar)
  let rNorm = inputNCHW[pixelIndex];
  let gNorm = inputNCHW[pixelCount + pixelIndex];
  let bNorm = inputNCHW[pixelCount * 2u + pixelIndex];

  // Denormalize from [-1, 1] to [0, 1] with rounding to match 8-bit output
  let r = round(clamp(rNorm * 127.5 + 127.5, 0.0, 255.0)) / 255.0;
  let g = round(clamp(gNorm * 127.5 + 127.5, 0.0, 255.0)) / 255.0;
  let b = round(clamp(bNorm * 127.5 + 127.5, 0.0, 255.0)) / 255.0;

  textureStore(outputRGBA, vec2u(x, y), vec4f(r, g, b, 1.0));
}
`;

// Bridge shader: passthrough fullscreen triangle for OffscreenCanvas bridge
const bridgeShaderCode = `
@group(0) @binding(0) var texSampler: sampler;
@group(0) @binding(1) var texInput: texture_2d<f32>;

struct VertexOutput {
  @builtin(position) position: vec4f,
  @location(0) uv: vec2f,
};

@vertex
fn vs_main(@builtin(vertex_index) vi: u32) -> VertexOutput {
  // Fullscreen triangle
  var out: VertexOutput;
  let x = f32((vi << 1u) & 2u);
  let y = f32(vi & 2u);
  out.position = vec4f(x * 2.0 - 1.0, 1.0 - y * 2.0, 0.0, 1.0);
  out.uv = vec2f(x, y);
  return out;
}

@fragment
fn fs_main(in: VertexOutput) -> @location(0) vec4f {
  return textureSample(texInput, texSampler, in.uv);
}
`;

async function measureAsyncPhase(name, fn) {
  const id = profileSequence++;
  const startMark = `onnx-image:${name}:start:${id}`;
  const endMark = `onnx-image:${name}:end:${id}`;
  performance.mark(startMark);
  try {
    return await fn();
  } finally {
    performance.mark(endMark);
    try {
      performance.measure(`onnx-image:${name}`, startMark, endMark);
    } catch (_) {}
  }
}

function measurePhase(name, fn) {
  const id = profileSequence++;
  const startMark = `onnx-image:${name}:start:${id}`;
  const endMark = `onnx-image:${name}:end:${id}`;
  performance.mark(startMark);
  try {
    return fn();
  } finally {
    performance.mark(endMark);
    try {
      performance.measure(`onnx-image:${name}`, startMark, endMark);
    } catch (_) {}
  }
}

function destroyGpuResources() {
  rgbaBuffer?.destroy();
  inputBuffer?.destroy();
  outputBuffer?.destroy();
  bridgeTexture?.destroy();

  rgbaBuffer = null;
  inputBuffer = null;
  outputBuffer = null;
  inputTensor = null;
  outputTensor = null;
  convertInputPipeline = null;
  convertOutputPipeline = null;
  convertInputBindGroup = null;
  convertOutputBindGroup = null;
  bridgeTexture = null;
  bridgeTextureView = null;
  bridgeRenderPipeline = null;
  bridgeSampler = null;
  bridgeBindGroupLayout = null;
  bridgeBindGroup = null;
  bridgeCanvas = null;
  bridgeCtx = null;
}

node.onStart = async () => {
  target = new figment.RenderTarget({ label: 'onnxImageModel' });
  target.setSize(IMAGE_WIDTH, IMAGE_HEIGHT);
  inputReadback = figment.createTextureReadback();
};

node.onStop = () => {
  destroyGpuResources();
  inputReadback?.destroy();
  inputReadback = null;
  if (session) {
    void session.release();
    session = null;
  }
  if (target) target.destroy();
};

async function loadModel() {
  if (!modelFileIn.value) return;

  destroyGpuResources();
  if (session) {
    await session.release();
    session = null;
  }
  device = null;

  const modelUrl = figment.urlForAsset(modelFileIn.value);
  try {
    ort.env.webgpu.powerPreference = 'high-performance';
    session = await ort.InferenceSession.create(modelUrl, { executionProviders: ['webgpu'] });
    device = ort.env.webgpu.device;

    rgbaBuffer = device.createBuffer({
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC,
      size: RGBA_SIZE,
    });
    inputBuffer = device.createBuffer({ usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST, size: BUFFER_SIZE });
    outputBuffer = device.createBuffer({ usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC, size: BUFFER_SIZE });

    // Create ONNX tensors
    inputTensor = ort.Tensor.fromGpuBuffer(inputBuffer, { dataType: 'float32', dims: [1, 3, 512, 512] });
    outputTensor = ort.Tensor.fromGpuBuffer(outputBuffer, { dataType: 'float32', dims: [1, 3, 512, 512] });

    // Create compute pipelines for format conversion
    const convertInputModule = device.createShaderModule({ code: rgbaToNchwShader });
    const convertOutputModule = device.createShaderModule({ code: nchwToRgbaShader });

    convertInputPipeline = device.createComputePipeline({
      layout: 'auto',
      compute: { module: convertInputModule, entryPoint: 'main' },
    });

    convertOutputPipeline = device.createComputePipeline({
      layout: 'auto',
      compute: { module: convertOutputModule, entryPoint: 'main' },
    });

    convertInputBindGroup = device.createBindGroup({
      layout: convertInputPipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: rgbaBuffer } },
        { binding: 1, resource: { buffer: inputBuffer } },
      ],
    });

    const canvasFormat = navigator.gpu.getPreferredCanvasFormat();
    bridgeCanvas = new OffscreenCanvas(IMAGE_WIDTH, IMAGE_HEIGHT);
    bridgeCtx = bridgeCanvas.getContext('webgpu');
    bridgeCtx.configure({ device, format: canvasFormat });

    bridgeTexture = device.createTexture({
      size: [IMAGE_WIDTH, IMAGE_HEIGHT],
      format: 'rgba8unorm',
      usage: GPUTextureUsage.STORAGE_BINDING | GPUTextureUsage.TEXTURE_BINDING,
    });
    bridgeTextureView = bridgeTexture.createView();

    bridgeSampler = device.createSampler({ magFilter: 'linear', minFilter: 'linear' });

    const bridgeModule = device.createShaderModule({ code: bridgeShaderCode });
    bridgeBindGroupLayout = device.createBindGroupLayout({
      entries: [
        { binding: 0, visibility: GPUShaderStage.FRAGMENT, sampler: {} },
        { binding: 1, visibility: GPUShaderStage.FRAGMENT, texture: {} },
      ],
    });
    bridgeRenderPipeline = device.createRenderPipeline({
      layout: device.createPipelineLayout({ bindGroupLayouts: [bridgeBindGroupLayout] }),
      vertex: { module: bridgeModule, entryPoint: 'vs_main' },
      fragment: {
        module: bridgeModule,
        entryPoint: 'fs_main',
        targets: [{ format: canvasFormat }],
      },
    });

    convertOutputBindGroup = device.createBindGroup({
      layout: convertOutputPipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: outputBuffer } },
        { binding: 1, resource: bridgeTextureView },
      ],
    });

    bridgeBindGroup = device.createBindGroup({
      layout: bridgeBindGroupLayout,
      entries: [
        { binding: 0, resource: bridgeSampler },
        { binding: 1, resource: bridgeTextureView },
      ],
    });

    oldModelFile = modelFileIn.value;
  } catch (e) {
    destroyGpuResources();
    if (session) {
      await session.release();
      session = null;
    }
    device = null;
    console.error('Failed to load ONNX model:', e);
  }
}

node.onRender = async () => {
  if (isRunning) return;
  if (oldModelFile !== modelFileIn.value) {
    isRunning = true;
    await loadModel();
    isRunning = false;
  }
  if (!session) return;
  if (!imageIn.value) return;
  if (imageIn.value.width !== IMAGE_WIDTH || imageIn.value.height !== IMAGE_HEIGHT) {
    throw new Error('Image must be 512x512');
  }

  isRunning = true;

  try {
    const inputBytes = await measureAsyncPhase('input-readback', () => inputReadback.read(imageIn.value));

    measurePhase('input-upload', () => {
      device.queue.writeBuffer(rgbaBuffer, 0, inputBytes);
    });

    measurePhase('preprocess-dispatch', () => {
      const inputEncoder = device.createCommandEncoder();
      const convertInputPass = inputEncoder.beginComputePass();
      convertInputPass.setPipeline(convertInputPipeline);
      convertInputPass.setBindGroup(0, convertInputBindGroup);
      convertInputPass.dispatchWorkgroups(IMAGE_WIDTH / 16, IMAGE_HEIGHT / 16);
      convertInputPass.end();
      device.queue.submit([inputEncoder.finish()]);
    });

    await measureAsyncPhase('session-run', () => session.run({ input: inputTensor }, { output: outputTensor }));

    measurePhase('postprocess-dispatch', () => {
      const canvasTexture = bridgeCtx.getCurrentTexture();
      const encoder = device.createCommandEncoder();
      const convertOutputPass = encoder.beginComputePass();
      convertOutputPass.setPipeline(convertOutputPipeline);
      convertOutputPass.setBindGroup(0, convertOutputBindGroup);
      convertOutputPass.dispatchWorkgroups(IMAGE_WIDTH / 16, IMAGE_HEIGHT / 16);
      convertOutputPass.end();

      const pass = encoder.beginRenderPass({
        colorAttachments: [{ view: canvasTexture.createView(), loadOp: 'clear', storeOp: 'store', clearValue: { r: 0, g: 0, b: 0, a: 1 } }],
      });
      pass.setPipeline(bridgeRenderPipeline);
      pass.setBindGroup(0, bridgeBindGroup);
      pass.draw(3);
      pass.end();

      device.queue.submit([encoder.finish()]);
    });

    measurePhase('bridge-upload', () => {
      target.uploadExternal(bridgeCanvas);
    });

    imageOut.set(target);
  } finally {
    isRunning = false;
  }
};
