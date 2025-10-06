/**
 * @name Segment Image
 * @description Remove the background from an image using MediaPipe Image Segmenter
 * @category ml
 */

const imageIn = node.imageIn('in');
const operationIn = node.selectIn('remove', ['background', 'foreground']);
const modelIn = node.selectIn('model', ['selfie', 'hair', 'multiclass', 'deeplab'], 'selfie');
const outputTypeIn = node.selectIn('outputType', ['categoryMask', 'confidenceMasks'], 'categoryMask');
const imageOut = node.imageOut('out');

let _vision, _imageSegmenter;
let _framebuffer, _canvas, _ctx, _imageData;
let _initialising = false;

// Model file mappings - FIXME: Update with actual model filenames
const MODEL_FILES = {
  selfie: 'selfie_segmenter.tflite',
  hair: 'hair_segmenter.task_FIXME',
  multiclass: 'selfie_multiclass.task_FIXME',
  deeplab: 'deeplab_v3.task_FIXME',
};

async function initSegmenter() {
  if (_initialising) return;
  _initialising = true;
  if (_imageSegmenter) {
    await _imageSegmenter.close();
  }

  const modelPath = `./mediapipe/${MODEL_FILES[modelIn.value]}`;

  _imageSegmenter = await mediapipe.ImageSegmenter.createFromOptions(_vision, {
    baseOptions: {
      modelAssetPath: modelPath,
      delegate: 'GPU',
    },
    runningMode: 'IMAGE',
    outputCategoryMask: outputTypeIn.value === 'categoryMask',
    outputConfidenceMasks: outputTypeIn.value === 'confidenceMasks',
  });
  _initialising = false;
}

node.onStart = async () => {
  _framebuffer = new figment.Framebuffer();
  _canvas = new OffscreenCanvas(1, 1);
  _ctx = _canvas.getContext('2d');
  _vision = await mediapipe.FilesetResolver.forVisionTasks('./mediapipe');
  await initSegmenter();
};

node.onRender = () => {
  if (!imageIn.value || _initialising) return;
  const width = imageIn.value.width;
  const height = imageIn.value.height;

  if (width !== _canvas.width || height !== _canvas.height) {
    _canvas.width = width;
    _canvas.height = height;
    _imageData = new ImageData(width, height);
    _framebuffer.setSize(width, height);
  }

  imageIn.value.bind();
  window.gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, _imageData.data);
  imageIn.value.unbind();

  // Create a temporary canvas to convert ImageData to HTMLImageElement
  const tempCanvas = new OffscreenCanvas(width, height);
  const tempCtx = tempCanvas.getContext('2d');
  tempCanvas.width = width;
  tempCanvas.height = height;
  tempCtx.putImageData(_imageData, 0, 0);

  // Convert canvas to image element for MediaPipe
  const imageElement = tempCanvas.transferToImageBitmap();

  const result = _imageSegmenter.segment(imageElement);
  drawResults(result);
};

function drawResults(result) {
  if (!imageIn.value || !result) return;
  const width = imageIn.value.width;
  const height = imageIn.value.height;

  _ctx.save();
  _ctx.globalCompositeOperation = 'source-over';
  _ctx.clearRect(0, 0, _canvas.width, _canvas.height);

  let mask;

  if (outputTypeIn.value === 'categoryMask' && result.categoryMask) {
    mask = result.categoryMask;
  } else if (outputTypeIn.value === 'confidenceMasks' && result.confidenceMasks && result.confidenceMasks.length > 0) {
    // Use the first confidence mask (usually person/foreground)
    mask = result.confidenceMasks[0];
  }

  if (mask) {
    if (operationIn.value === 'background') {
      // Draw the segmentation mask
      _ctx.drawImage(mask, 0, 0);

      // Only overwrite existing pixels (i.e. the mask) with the image
      _ctx.globalCompositeOperation = 'source-in';
      _ctx.drawImage(_imageData, 0, 0);
    } else {
      // Fill the destination
      _ctx.fillRect(0, 0, _canvas.width, _canvas.height);

      // Draw everything outside of the segmentation mask
      _ctx.globalCompositeOperation = 'destination-out';
      _ctx.drawImage(mask, 0, 0);

      // Overwrite the existing pixels (i.e. the background) with the image
      _ctx.globalCompositeOperation = 'source-in';
      _ctx.drawImage(_imageData, 0, 0);
    }
  }

  _ctx.restore();
  window.gl.bindTexture(gl.TEXTURE_2D, _framebuffer.texture);
  window.gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, _canvas);
  window.gl.bindTexture(gl.TEXTURE_2D, null);
  imageOut.value = _framebuffer;
}

modelIn.onChange = initSegmenter;
outputTypeIn.onChange = initSegmenter;
