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
  canvas,
  framebuffer,
  isRunning = false;
const BUFFER_SIZE = 3 * 512 * 512 * 4;
const imageData = new Uint8Array(4 * 512 * 512);
const textureBuffer = new Uint8Array(4 * 512 * 512);
let inputBuffer, outputBuffer, stagingBuffer, inputTensor, outputTensor;
let rgbaBuffer, rgbaStagingBuffer, convertInputPipeline, convertOutputPipeline, convertInputBindGroup, convertOutputBindGroup;

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

node.onStart = async () => {
  canvas = new OffscreenCanvas(512, 512);
  framebuffer = new figment.Framebuffer(512, 512);
};

node.onStop = () => {
  // Clean up GPU resources
  if (rgbaBuffer) rgbaBuffer.destroy();
  if (rgbaStagingBuffer) rgbaStagingBuffer.destroy();
  if (inputBuffer) inputBuffer.destroy();
  if (outputBuffer) outputBuffer.destroy();
  if (stagingBuffer) stagingBuffer.destroy();
  if (session) session.release();
};

async function loadModel() {
  if (!modelFileIn.value) return;

  // Clean up old resources to prevent memory leak
  if (rgbaBuffer) rgbaBuffer.destroy();
  if (rgbaStagingBuffer) rgbaStagingBuffer.destroy();
  if (inputBuffer) inputBuffer.destroy();
  if (outputBuffer) outputBuffer.destroy();
  if (stagingBuffer) stagingBuffer.destroy();
  if (session) await session.release();

  const modelUrl = figment.urlForAsset(modelFileIn.value);
  try {
    ort.env.webgpu.powerPreference = 'high-performance';
    session = await ort.InferenceSession.create(modelUrl, { executionProviders: ['webgpu'] });
    device = ort.env.webgpu.device;

    // Create GPU buffers
    const RGBA_SIZE = 4 * 512 * 512; // RGBA as u32 array (or bytes)
    rgbaBuffer = device.createBuffer({
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC,
      size: RGBA_SIZE,
    });
    inputBuffer = device.createBuffer({ usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST, size: BUFFER_SIZE });
    outputBuffer = device.createBuffer({ usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC, size: BUFFER_SIZE });
    stagingBuffer = device.createBuffer({ usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST, size: BUFFER_SIZE });
    rgbaStagingBuffer = device.createBuffer({ usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST, size: RGBA_SIZE });

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

    // Create bind groups for the pipelines
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
    // Read framebuffer pixels
    imageIn.value.bind();
    window.gl.readPixels(0, 0, 512, 512, gl.RGBA, gl.UNSIGNED_BYTE, imageData);
    imageIn.value.unbind();

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

    // Convert NCHW output to RGBA using compute shader
    const outputEncoder = device.createCommandEncoder();

    // Run NCHW to RGBA conversion
    const convertOutputPass = outputEncoder.beginComputePass();
    convertOutputPass.setPipeline(convertOutputPipeline);
    convertOutputPass.setBindGroup(0, convertOutputBindGroup);
    convertOutputPass.dispatchWorkgroups(32, 32); // 512/16 = 32 workgroups per dimension
    convertOutputPass.end();

    // Copy RGBA result to staging buffer for CPU readback
    outputEncoder.copyBufferToBuffer(rgbaBuffer, 0, rgbaStagingBuffer, 0, 4 * 512 * 512);
    device.queue.submit([outputEncoder.finish()]);

    // Read back RGBA data
    await rgbaStagingBuffer.mapAsync(GPUMapMode.READ, 0, 4 * 512 * 512);
    const rgbaArrayBuffer = rgbaStagingBuffer.getMappedRange(0, 4 * 512 * 512);
    textureBuffer.set(new Uint8Array(rgbaArrayBuffer));
    rgbaStagingBuffer.unmap();

    // Upload the RGBA data directly to the framebuffer's texture
    gl.bindTexture(gl.TEXTURE_2D, framebuffer.texture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 512, 512, 0, gl.RGBA, gl.UNSIGNED_BYTE, textureBuffer);
    gl.bindTexture(gl.TEXTURE_2D, null);
    imageOut.set(framebuffer);
  } finally {
    isRunning = false;
  }
};
