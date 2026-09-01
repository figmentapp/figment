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
let imageWidth = 0,
  imageHeight = 0;
let outWidth = 0,
  outHeight = 0;
let inputWorkgroupsX, inputWorkgroupsY, outputWorkgroupsX, outputWorkgroupsY;
let inputBuffer, outputBuffer, inputTensor, outputTensor;
let convertInputPipeline, convertOutputPipeline, convertOutputBindGroup;
let bridgeTexture, bridgeTextureView;
let inputName, outputName;
let profileSequence = 0;

function makeTextureToNchwShader(width, height) {
  return `
@group(0) @binding(0) var inputTexture: texture_2d<f32>;
@group(0) @binding(1) var<storage, read_write> outputNCHW: array<f32>;

@compute @workgroup_size(16, 16)
fn main(@builtin(global_invocation_id) global_id: vec3<u32>) {
  let width = ${width}u;
  let height = ${height}u;
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
}

function makeNchwToRgbaShader(width, height) {
  return `
@group(0) @binding(0) var<storage, read> inputNCHW: array<f32>;
@group(0) @binding(1) var outputRGBA: texture_storage_2d<rgba8unorm, write>;

@compute @workgroup_size(16, 16)
fn main(@builtin(global_invocation_id) global_id: vec3<u32>) {
  let width = ${width}u;
  let height = ${height}u;
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
}

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
  inputName = null;
  outputName = null;
  imageWidth = 0;
  imageHeight = 0;
  outWidth = 0;
  outHeight = 0;
}

node.onStart = async () => {
  target = new figment.RenderTarget({ label: 'onnxImageModel' });
};

node.onStop = () => {
  destroyGpuResources();
  if (session) {
    void figment.withOrt(() => session.release());
    session = null;
  }
  if (target) target.destroy();
};

async function loadModel() {
  if (!modelFileIn.value) return;

  destroyGpuResources();
  if (session) {
    await figment.withOrt(() => session.release());
    session = null;
  }
  device = null;

  const modelUrl = figment.urlForAsset(modelFileIn.value);
  try {
    ort.env.webgpu.powerPreference = 'high-performance';
    ort.env.webgpu.adapter = figment.getAdapter();
    ort.env.webgpu.device = figment.getDevice();
    session = await figment.createOrtSession(modelUrl);
    device = figment.getDevice();

    // Read input/output dimensions from the model metadata (NCHW layout: [batch, channels, height, width])
    const inMeta = session.inputMetadata[0];
    const outMeta = session.outputMetadata[0];
    inputName = inMeta.name;
    outputName = outMeta.name;
    const inShape = inMeta.shape;
    const outShape = outMeta.shape;

    if (inShape.length !== 4 || outShape.length !== 4) {
      throw new Error(`Expected 4D NCHW tensors, got input ${inShape.length}D and output ${outShape.length}D`);
    }
    if (typeof inShape[2] !== 'number' || typeof inShape[3] !== 'number') {
      throw new Error(`Model has dynamic spatial dimensions (${inShape[2]}×${inShape[3]}), which is not supported`);
    }
    if (typeof outShape[2] !== 'number' || typeof outShape[3] !== 'number') {
      throw new Error(`Model has dynamic output dimensions (${outShape[2]}×${outShape[3]}), which is not supported`);
    }
    if (inShape[1] !== 3 || outShape[1] !== 3) {
      throw new Error(`Expected 3-channel (RGB) tensors, got input ${inShape[1]} and output ${outShape[1]} channels`);
    }

    imageWidth = inShape[3];
    imageHeight = inShape[2];
    const pixelCount = imageWidth * imageHeight;
    const bufferSize = 3 * pixelCount * 4;

    outWidth = outShape[3];
    outHeight = outShape[2];

    inputWorkgroupsX = Math.ceil(imageWidth / 16);
    inputWorkgroupsY = Math.ceil(imageHeight / 16);
    outputWorkgroupsX = Math.ceil(outWidth / 16);
    outputWorkgroupsY = Math.ceil(outHeight / 16);

    target.setSize(outWidth, outHeight);

    inputBuffer = device.createBuffer({ usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST, size: bufferSize });
    const outputBufferSize = 3 * outWidth * outHeight * 4;
    outputBuffer = device.createBuffer({ usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC, size: outputBufferSize });

    // Create ONNX tensors with dimensions from the model
    inputTensor = ort.Tensor.fromGpuBuffer(inputBuffer, { dataType: 'float32', dims: [1, 3, imageHeight, imageWidth] });
    outputTensor = ort.Tensor.fromGpuBuffer(outputBuffer, { dataType: 'float32', dims: [1, 3, outHeight, outWidth] });

    // Create compute pipelines for format conversion (shaders need model-specific dimensions)
    const convertInputModule = device.createShaderModule({ code: makeTextureToNchwShader(imageWidth, imageHeight) });
    const convertOutputModule = device.createShaderModule({ code: makeNchwToRgbaShader(outWidth, outHeight) });

    convertInputPipeline = device.createComputePipeline({
      layout: 'auto',
      compute: { module: convertInputModule, entryPoint: 'main' },
    });

    convertOutputPipeline = device.createComputePipeline({
      layout: 'auto',
      compute: { module: convertOutputModule, entryPoint: 'main' },
    });

    bridgeTexture = device.createTexture({
      size: [outWidth, outHeight],
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
      await figment.withOrt(() => session.release());
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
      convertInputPass.dispatchWorkgroups(inputWorkgroupsX, inputWorkgroupsY);
      convertInputPass.end();
      device.queue.submit([inputEncoder.finish()]);
    });

    await measureAsyncPhase('session-run', () =>
      figment.withOrt(() => session.run({ [inputName]: inputTensor }, { [outputName]: outputTensor })),
    );

    measurePhase('postprocess-dispatch', () => {
      const encoder = device.createCommandEncoder();
      const convertOutputPass = encoder.beginComputePass();
      convertOutputPass.setPipeline(convertOutputPipeline);
      convertOutputPass.setBindGroup(0, convertOutputBindGroup);
      convertOutputPass.dispatchWorkgroups(outputWorkgroupsX, outputWorkgroupsY);
      convertOutputPass.end();

      encoder.copyTextureToTexture({ texture: bridgeTexture }, { texture: target.texture }, [outWidth, outHeight]);

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
    oldModelFile = modelFileIn.value;
    isRunning = true;
    loadModel()
      .catch((e) => {
        node.error = e && e.stack ? e.stack : String(e);
      })
      .finally(() => {
        isRunning = false;
        node._markDirty();
      });
    return;
  }
  if (!session || !imageIn.value) return;
  if (imageIn.value.width !== imageWidth || imageIn.value.height !== imageHeight) {
    throw new Error(`Image must be ${imageWidth}×${imageHeight} (model expects this size)`);
  }

  // Always output the current target (shows last completed inference)
  imageOut.set(target);

  // Kick off new inference if not already running
  if (!isRunning) {
    runInference()
      .catch((e) => {
        node.error = e && e.stack ? e.stack : String(e);
      })
      .finally(() => {
        node.network.markDownstreamDirty(node);
      });
  }
};
