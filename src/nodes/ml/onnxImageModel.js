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
const inputArray = new Float32Array(3 * 512 * 512);
const outputArray = new Float32Array(3 * 512 * 512);
const textureBuffer = new Uint8Array(4 * 512 * 512);
let inputBuffer, outputBuffer, stagingBuffer, inputTensor, outputTensor;

node.onStart = async () => {
  canvas = new OffscreenCanvas(512, 512);
  framebuffer = new figment.Framebuffer(512, 512);
};

async function loadModel() {
  if (!modelFileIn.value) return;
  const modelUrl = figment.urlForAsset(modelFileIn.value);
  try {
    ort.env.webgpu.powerPreference = 'high-performance';
    session = await ort.InferenceSession.create(modelUrl, { executionProviders: ['webgpu'], enableGraphCapture: true });
    device = ort.env.webgpu.device;
    inputBuffer = device.createBuffer({ usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST, size: BUFFER_SIZE });
    outputBuffer = device.createBuffer({ usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC, size: BUFFER_SIZE });
    stagingBuffer = device.createBuffer({ usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST, size: BUFFER_SIZE });
    inputTensor = ort.Tensor.fromGpuBuffer(inputBuffer, { dataType: 'float32', dims: [1, 3, 512, 512] });
    outputTensor = ort.Tensor.fromGpuBuffer(outputBuffer, { dataType: 'float32', dims: [1, 3, 512, 512] });
    oldModelFile = modelFileIn.value;
  } catch (e) {
    console.error('Failed to load ONNX model:', e);
  }
}

function clamp(v) {
  return Math.max(0, Math.min(255, Math.round(v)));
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

  // Convert framebuffer to input tensor
  imageIn.value.bind();
  window.gl.readPixels(0, 0, 512, 512, gl.RGBA, gl.UNSIGNED_BYTE, imageData);
  imageIn.value.unbind();
  const pixelCount = 512 * 512;
  // ONNX expects images in NCHW format, so we need to have all channels after each other.
  // In other words, first all red pixels, then all green pixels, and finally all blue pixels.
  let redOffset = 0;
  let greenOffset = pixelCount;
  let blueOffset = pixelCount * 2;
  for (let i = 0; i < pixelCount; i++) {
    const inOffset = i * 4;
    inputArray[redOffset++] = imageData[inOffset] / 127.5 - 1;
    inputArray[greenOffset++] = imageData[inOffset + 1] / 127.5 - 1;
    inputArray[blueOffset++] = imageData[inOffset + 2] / 127.5 - 1;
  }
  device.queue.writeBuffer(inputBuffer, 0, inputArray);

  // Run inference
  await session.run({ input: inputTensor }, { output: outputTensor });

  // Do some WebGPU magic to get the data from the output tensor to a Float32Array
  const commandEncoder = device.createCommandEncoder();
  commandEncoder.copyBufferToBuffer(outputBuffer, 0, stagingBuffer, 0, BUFFER_SIZE);
  device.queue.submit([commandEncoder.finish()]);
  await stagingBuffer.mapAsync(GPUMapMode.READ, 0, BUFFER_SIZE);
  const copyArrayBuffer = stagingBuffer.getMappedRange(0, BUFFER_SIZE);
  outputArray.set(new Float32Array(copyArrayBuffer));
  stagingBuffer.unmap();

  // Convert the output array to framebuffer
  redOffset = 0;
  greenOffset = pixelCount;
  blueOffset = pixelCount * 2;
  for (let i = 0; i < pixelCount; i++) {
    const outOffset = i * 4;
    textureBuffer[outOffset] = clamp(outputArray[redOffset++] * 127.5 + 127.5);
    textureBuffer[outOffset + 1] = clamp(outputArray[greenOffset++] * 127.5 + 127.5);
    textureBuffer[outOffset + 2] = clamp(outputArray[blueOffset++] * 127.5 + 127.5);
    textureBuffer[outOffset + 3] = 255;
  }

  // Upload the RGBA data directly to the framebuffer's texture
  gl.bindTexture(gl.TEXTURE_2D, framebuffer.texture);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 512, 512, 0, gl.RGBA, gl.UNSIGNED_BYTE, textureBuffer);
  gl.bindTexture(gl.TEXTURE_2D, null);
  imageOut.set(framebuffer);
  isRunning = false;
};
