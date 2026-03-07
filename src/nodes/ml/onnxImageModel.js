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
const BUFFER_SIZE = 3 * 512 * 512 * 4;
let inputBuffer, outputBuffer, inputTensor, outputTensor;
let rgbaBuffer, convertInputPipeline, convertOutputPipeline, convertInputBindGroup, convertOutputBindGroup;
// Bridge resources for zero-copy output (ONNX device → OffscreenCanvas → Figment device)
let bridgeCanvas, bridgeCtx, bridgeTexture, bridgeRenderPipeline, bridgeSampler, bridgeBindGroupLayout;

// WGSL compute shader: RGBA (uint8) → NCHW (float32) with normalization
const rgbaToNchwShader = `
@group(0) @binding(0) var<storage, read> inputRGBA: array<u32>;
@group(0) @binding(1) var<storage, read_write> outputNCHW: array<f32>;

@compute @workgroup_size(16, 16)
fn main(@builtin(global_invocation_id) global_id: vec3<u32>) {
  let width = 512u;
  let height = 512u;
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

// WGSL compute shader: NCHW (float32) → RGBA (uint8) with denormalization
const nchwToRgbaShader = `
@group(0) @binding(0) var<storage, read> inputNCHW: array<f32>;
@group(0) @binding(1) var<storage, read_write> outputRGBA: array<u32>;

@compute @workgroup_size(16, 16)
fn main(@builtin(global_invocation_id) global_id: vec3<u32>) {
  let width = 512u;
  let height = 512u;
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

  // Denormalize from [-1, 1] to [0, 255] with clamping
  let r = u32(clamp(round(rNorm * 127.5 + 127.5), 0.0, 255.0));
  let g = u32(clamp(round(gNorm * 127.5 + 127.5), 0.0, 255.0));
  let b = u32(clamp(round(bNorm * 127.5 + 127.5), 0.0, 255.0));
  let a = 255u;

  // Pack RGBA into u32 (little-endian: ABGR in memory)
  outputRGBA[pixelIndex] = r | (g << 8u) | (b << 16u) | (a << 24u);
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

node.onStart = async () => {
  target = new figment.RenderTarget({ label: 'onnxImageModel' });
  target.setSize(512, 512);
};

node.onStop = () => {
  if (rgbaBuffer) rgbaBuffer.destroy();
  if (inputBuffer) inputBuffer.destroy();
  if (outputBuffer) outputBuffer.destroy();
  if (bridgeTexture) bridgeTexture.destroy();
  if (session) session.release();
  if (target) target.destroy();
};

async function loadModel() {
  if (!modelFileIn.value) return;

  // Clean up old resources to prevent memory leak
  if (rgbaBuffer) rgbaBuffer.destroy();
  if (inputBuffer) inputBuffer.destroy();
  if (outputBuffer) outputBuffer.destroy();
  if (bridgeTexture) bridgeTexture.destroy();
  if (session) await session.release();

  const modelUrl = figment.urlForAsset(modelFileIn.value);
  try {
    ort.env.webgpu.powerPreference = 'high-performance';
    session = await ort.InferenceSession.create(modelUrl, { executionProviders: ['webgpu'] });
    device = ort.env.webgpu.device;

    // Create GPU buffers
    const RGBA_SIZE = 4 * 512 * 512;
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

    convertOutputBindGroup = device.createBindGroup({
      layout: convertOutputPipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: outputBuffer } },
        { binding: 1, resource: { buffer: rgbaBuffer } },
      ],
    });

    // Set up OffscreenCanvas bridge for zero-copy output
    const canvasFormat = navigator.gpu.getPreferredCanvasFormat();
    bridgeCanvas = new OffscreenCanvas(512, 512);
    bridgeCtx = bridgeCanvas.getContext('webgpu');
    bridgeCtx.configure({ device, format: canvasFormat });

    // Texture on ONNX device to receive rgbaBuffer via copyBufferToTexture
    bridgeTexture = device.createTexture({
      size: [512, 512],
      format: 'rgba8unorm',
      usage: GPUTextureUsage.COPY_DST | GPUTextureUsage.TEXTURE_BINDING,
    });

    bridgeSampler = device.createSampler({ magFilter: 'linear', minFilter: 'linear' });

    // Render pipeline to draw bridgeTexture → canvas (with R↔B swizzle)
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

    oldModelFile = modelFileIn.value;
  } catch (e) {
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
  if (imageIn.value.width !== 512 || imageIn.value.height !== 512) {
    throw new Error('Image must be 512x512');
  }

  isRunning = true;

  try {
    // Read input pixels
    const pixelData = await imageIn.value.readPixels();
    const imageData = new Uint8Array(pixelData.data.buffer);

    // Upload RGBA data to GPU and convert to NCHW
    device.queue.writeBuffer(rgbaBuffer, 0, imageData);

    const inputEncoder = device.createCommandEncoder();
    const convertInputPass = inputEncoder.beginComputePass();
    convertInputPass.setPipeline(convertInputPipeline);
    convertInputPass.setBindGroup(0, convertInputBindGroup);
    convertInputPass.dispatchWorkgroups(32, 32); // 512/16 = 32 workgroups per dimension
    convertInputPass.end();
    device.queue.submit([inputEncoder.finish()]);

    // Run inference
    await session.run({ input: inputTensor }, { output: outputTensor });

    // Convert NCHW output to RGBA, then copy buffer → texture on ONNX device
    const outputEncoder = device.createCommandEncoder();
    const convertOutputPass = outputEncoder.beginComputePass();
    convertOutputPass.setPipeline(convertOutputPipeline);
    convertOutputPass.setBindGroup(0, convertOutputBindGroup);
    convertOutputPass.dispatchWorkgroups(32, 32);
    convertOutputPass.end();
    outputEncoder.copyBufferToTexture({ buffer: rgbaBuffer, bytesPerRow: 512 * 4 }, { texture: bridgeTexture }, [512, 512]);
    device.queue.submit([outputEncoder.finish()]);

    // Render bridgeTexture → OffscreenCanvas (with R↔B swizzle for bgra canvas format)
    const bridgeBindGroup = device.createBindGroup({
      layout: bridgeBindGroupLayout,
      entries: [
        { binding: 0, resource: bridgeSampler },
        { binding: 1, resource: bridgeTexture.createView() },
      ],
    });
    const canvasTexture = bridgeCtx.getCurrentTexture();
    const renderEncoder = device.createCommandEncoder();
    const pass = renderEncoder.beginRenderPass({
      colorAttachments: [{ view: canvasTexture.createView(), loadOp: 'clear', storeOp: 'store', clearValue: { r: 0, g: 0, b: 0, a: 1 } }],
    });
    pass.setPipeline(bridgeRenderPipeline);
    pass.setBindGroup(0, bridgeBindGroup);
    pass.draw(3);
    pass.end();
    device.queue.submit([renderEncoder.finish()]);

    // Transfer to Figment device via browser-optimized canvas path (no CPU readback)
    target.uploadExternal(bridgeCanvas);
    imageOut.set(target);
  } finally {
    isRunning = false;
  }
};
