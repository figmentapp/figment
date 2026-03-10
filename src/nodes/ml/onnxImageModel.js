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
  isRunning = false;
const IMAGE_WIDTH = 512;
const IMAGE_HEIGHT = 512;
const PIXEL_COUNT = IMAGE_WIDTH * IMAGE_HEIGHT;
const BUFFER_SIZE = 3 * PIXEL_COUNT * 4;
let inputBuffer, outputBuffer, inputTensor, outputTensor;
let convertInputPipeline, convertOutputPipeline, convertOutputBindGroup;
let bridgeTexture, bridgeTextureView;
let profileSequence = 0;

// WGSL compute shader: texture_2d<f32> → NCHW (float32) with normalization
const textureToNchwShader = `
@group(0) @binding(0) var inputTexture: texture_2d<f32>;
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

  // textureLoad from rgba8unorm returns [0, 1] floats
  let pixel = textureLoad(inputTexture, vec2u(x, y), 0);

  // Normalize from [0, 1] to [-1, 1]
  let rNorm = pixel.r * 2.0 - 1.0;
  let gNorm = pixel.g * 2.0 - 1.0;
  let bNorm = pixel.b * 2.0 - 1.0;

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
  inputBuffer?.destroy();
  outputBuffer?.destroy();
  bridgeTexture?.destroy();

  inputBuffer = null;
  outputBuffer = null;
  inputTensor = null;
  outputTensor = null;
  convertInputPipeline = null;
  convertOutputPipeline = null;
  convertOutputBindGroup = null;
  bridgeTexture = null;
  bridgeTextureView = null;
}

node.onStart = async () => {
  target = new figment.RenderTarget({ label: 'onnxImageModel' });
  target.setSize(IMAGE_WIDTH, IMAGE_HEIGHT);
};

node.onStop = () => {
  destroyGpuResources();
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
    ort.env.webgpu.adapter = figment.getAdapter();
    ort.env.webgpu.device = figment.getDevice();
    session = await ort.InferenceSession.create(modelUrl, { executionProviders: ['webgpu'] });
    device = figment.getDevice();

    inputBuffer = device.createBuffer({ usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST, size: BUFFER_SIZE });
    outputBuffer = device.createBuffer({ usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC, size: BUFFER_SIZE });

    // Create ONNX tensors
    inputTensor = ort.Tensor.fromGpuBuffer(inputBuffer, { dataType: 'float32', dims: [1, 3, 512, 512] });
    outputTensor = ort.Tensor.fromGpuBuffer(outputBuffer, { dataType: 'float32', dims: [1, 3, 512, 512] });

    // Create compute pipelines for format conversion
    const convertInputModule = device.createShaderModule({ code: textureToNchwShader });
    const convertOutputModule = device.createShaderModule({ code: nchwToRgbaShader });

    convertInputPipeline = device.createComputePipeline({
      layout: 'auto',
      compute: { module: convertInputModule, entryPoint: 'main' },
    });

    convertOutputPipeline = device.createComputePipeline({
      layout: 'auto',
      compute: { module: convertOutputModule, entryPoint: 'main' },
    });

    bridgeTexture = device.createTexture({
      size: [IMAGE_WIDTH, IMAGE_HEIGHT],
      format: 'rgba8unorm',
      usage: GPUTextureUsage.STORAGE_BINDING | GPUTextureUsage.COPY_SRC,
    });
    bridgeTextureView = bridgeTexture.createView();

    convertOutputBindGroup = device.createBindGroup({
      layout: convertOutputPipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: outputBuffer } },
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

async function runInference() {
  isRunning = true;
  try {
    measurePhase('preprocess-dispatch', () => {
      const convertInputBindGroup = device.createBindGroup({
        layout: convertInputPipeline.getBindGroupLayout(0),
        entries: [
          { binding: 0, resource: imageIn.value.view },
          { binding: 1, resource: { buffer: inputBuffer } },
        ],
      });

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
      const encoder = device.createCommandEncoder();
      const convertOutputPass = encoder.beginComputePass();
      convertOutputPass.setPipeline(convertOutputPipeline);
      convertOutputPass.setBindGroup(0, convertOutputBindGroup);
      convertOutputPass.dispatchWorkgroups(IMAGE_WIDTH / 16, IMAGE_HEIGHT / 16);
      convertOutputPass.end();

      encoder.copyTextureToTexture({ texture: bridgeTexture }, { texture: target.texture }, [IMAGE_WIDTH, IMAGE_HEIGHT]);

      device.queue.submit([encoder.finish()]);
    });

    // Wait for actual GPU completion before allowing the next inference.
    // Without this, session.run() resolves after merely queuing GPU work,
    // isRunning clears immediately, and the next frame floods the GPU queue
    // with another inference — starving the compositor of GPU time.
    await device.queue.onSubmittedWorkDone();
  } finally {
    isRunning = false;
  }
}

node.onRender = () => {
  if (oldModelFile !== modelFileIn.value) {
    isRunning = true;
    loadModel().finally(() => {
      isRunning = false;
    });
    return;
  }
  if (!session || !imageIn.value) return;
  if (imageIn.value.width !== IMAGE_WIDTH || imageIn.value.height !== IMAGE_HEIGHT) {
    throw new Error('Image must be 512x512');
  }

  // Always output the current target (shows last completed inference)
  imageOut.set(target);

  // Kick off new inference if not already running
  if (!isRunning) {
    runInference();
  }
};
