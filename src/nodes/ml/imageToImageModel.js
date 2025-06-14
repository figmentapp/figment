/**
 * @name Image to Image Model
 * @description Run a generative image to image model (pix2pix).
 * @category ml
 */

const imageIn = node.imageIn('in');
const modelDir = node.directoryIn('model');
const imageOut = node.imageOut('out');

let oldModelDir, model, canvas, framebuffer;

node.onStart = () => {
  canvas = new OffscreenCanvas(512, 512);
  framebuffer = new figment.Framebuffer(512, 512);
};

async function loadModel() {
  if (!modelDir.value) return;
  const modelUrl = figment.urlForAsset(modelDir.value + '/model.json');
  model = await tf.loadGraphModel(modelUrl);
  oldModelDir = modelDir.value;
}

node.onRender = async () => {
  if (oldModelDir !== modelDir.value) {
    await loadModel();
  }
  if (!model) return;
  if (!imageIn.value) return;
  if (imageIn.value.width !== 512 || imageIn.value.height !== 512) {
    throw new Error('Image must be 512x512');
  }

  const imageData = figment.framebufferToImageData(imageIn.value);
  const inputTensor = tf.tidy(() => {
    let tensor = tf.expandDims(tf.browser.fromPixels(imageData), 0);
    // Normalize values between -1 and 1
    tensor = tensor.toFloat().div(tf.scalar(127.5)).sub(tf.scalar(1));
    return tensor;
  });

  // Execute the model
  let outputTensor = await model.execute(inputTensor);

  const result = tf.tidy(() => {
    // Convert results back to 0-1 range
    return outputTensor.mul(tf.scalar(0.5)).add(tf.scalar(0.5)).squeeze();
  });

  await tf.browser.toPixels(result, canvas);
  figment.canvasToFramebuffer(canvas, framebuffer);

  inputTensor.dispose();
  outputTensor.dispose();
  result.dispose();

  imageOut.set(framebuffer);
};
