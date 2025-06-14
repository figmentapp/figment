/**
 * @name Detect Pose
 * @description Detect human poses in input image.
 * @category ml
 */

const imageIn = node.imageIn('in');
const backgroundIn = node.colorIn('background', [0, 0, 0, 1]);
const pointsToggleIn = node.toggleIn('draw points', true);
const pointsColorIn = node.colorIn('points color', [255, 255, 255, 1]);
const pointsRadiusIn = node.numberIn('points radius', 2, { min: 0, max: 20, step: 0.1 });
const linesToggleIn = node.toggleIn('draw lines', true);
const linesColorIn = node.colorIn('lines color', [255, 255, 255, 1]);
const linesWidthIn = node.numberIn('lines width', 2, { min: 0, max: 20, step: 0.1 });

const imageOut = node.imageOut('out');
const detectedOut = node.booleanOut('detected');
const landmarksOut = node.objectOut('landmarks');

pointsColorIn.label = 'Color';
pointsRadiusIn.label = 'Radius';
linesColorIn.label = 'Color';
linesWidthIn.label = 'Line Width';

let _framebuffer, _pose, _canvas, _ctx, _imageData, _results, _isProcessing;

node.onStart = async (props) => {
  _framebuffer = new figment.Framebuffer();
  _canvas = new OffscreenCanvas(1, 1);
  _ctx = _canvas.getContext('2d');
  await figment.loadScripts(['./mediapipe/drawing_utils.js', './mediapipe/pose.js']);
  const pose = new Pose({
    locateFile: (file) => {
      return `./mediapipe/${file}`;
    },
  });
  pose.setOptions({
    modelComplexity: 1,
    smoothLandmarks: true,
  });
  await pose.initialize();
  _pose = pose;
};

function _detect(image) {
  // Check if only one image is processed at the same time.
  if (_isProcessing) return;
  return new Promise((resolve) => {
    _isProcessing = true;
    try {
      _pose.onResults((results) => {
        _pose.onResults(null);
        _isProcessing = false;
        resolve(results);
      });
      _pose.send({ image });
    } catch (err) {
      console.error('Error in pose detection:', err);
      _isProcessing = false;
      resolve(null);
    }
  });
}

node.onRender = async () => {
  if (!imageIn.value) return;
  if (!_pose) return;
  // Draw the image on an ImageData object.
  const width = imageIn.value.width;
  const height = imageIn.value.height;

  if (width !== _canvas.width || height !== _canvas.height) {
    _canvas.width = width;
    _canvas.height = height;
    _imageData = new ImageData(width, height);
    _framebuffer.setSize(width, height);
  }
  // Video nodes pass along this extra object with the framebuffer.
  // This allows mediapose to avoid reading the texture first from the framebuffer.
  if (imageIn.value._directImageHack) {
    _results = await _detect(imageIn.value._directImageHack);
  } else {
    imageIn.value.bind();
    window.gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, _imageData.data);
    imageIn.value.unbind();
    _results = await _detect(_imageData);
  }
  drawResults();
  landmarksOut.set(_results ? { type: 'pose', landmarks: _results.poseLandmarks } : null);
};

function drawResults() {
  if (!imageIn.value || !_results) return;
  const width = imageIn.value.width;
  const height = imageIn.value.height;
  _ctx.clearRect(0, 0, width, height);
  _ctx.fillStyle = figment.toCanvasColor(backgroundIn.value);
  _ctx.fillRect(0, 0, width, height);
  if (_results.poseLandmarks) {
    detectedOut.set(true);
    _ctx.fillStyle = 'white';
    if (linesToggleIn.value) {
      drawConnectors(_ctx, _results.poseLandmarks, POSE_CONNECTIONS, {
        color: figment.toCanvasColor(linesColorIn.value),
        lineWidth: linesWidthIn.value,
        visibilityMin: 0,
      });
    }
    if (pointsToggleIn.value) {
      drawLandmarks(_ctx, _results.poseLandmarks, { color: figment.toCanvasColor(pointsColorIn.value), lineWidth: pointsRadiusIn.value });
    }
  } else {
    detectedOut.set(false);
  }
  window.gl.bindTexture(gl.TEXTURE_2D, _framebuffer.texture);
  window.gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, _canvas);
  window.gl.bindTexture(gl.TEXTURE_2D, null);
  imageOut.set(_framebuffer);
}
