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

const POSE_STATE_INITIALIZING = 'INITIALIZING';
const POSE_STATE_RUNNING = 'RUNNING';

let _framebuffer, _pose, _canvas, _ctx, _imageData, _results;
let _isProcessing = false;
let _poseState = POSE_STATE_INITIALIZING;

node.onStart = async () => {
  _framebuffer = new figment.Framebuffer();
  _canvas = new OffscreenCanvas(1, 1);
  _ctx = _canvas.getContext('2d');
  await figment.loadScripts(['./mediapipe/drawing_utils.js', './mediapipe/pose.js']);

  _initPose();
};

async function _initPose() {
  _poseState = POSE_STATE_INITIALIZING;

  const pose = new Pose({ locateFile: (file) => `./mediapipe/${file}` });
  pose.setOptions({
    staticImageMode: false,
    modelComplexity: 1,
    smoothLandmarks: true,
  });

  await pose.initialize();
  pose.onResults(_onResults);

  _pose = pose;
  _poseState = POSE_STATE_RUNNING;
  _isProcessing = false;
}

node.onRender = () => {
  if (!imageIn.value) return;
  if (!_pose || _poseState !== POSE_STATE_RUNNING) return;
  if (_isProcessing) return;

  const width = imageIn.value.width;
  const height = imageIn.value.height;

  if (width !== _canvas.width || height !== _canvas.height) {
    _canvas.width = width;
    _canvas.height = height;
    _imageData = new ImageData(width, height);
    _framebuffer.setSize(width, height);
  }

  if (imageIn.value._directImageHack) {
    _detect(imageIn.value._directImageHack);
  } else {
    imageIn.value.bind();
    window.gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, _imageData.data);
    imageIn.value.unbind();
    _detect(_imageData);
  }
};

function _detect(image) {
  if (_isProcessing || !_pose) return;
  _isProcessing = true;
  _pose.send({ image }).catch((err) => _handleDetectionError(err));
}

function _onResults(results) {
  _isProcessing = false;
  _results = results;
  drawResults();
  landmarksOut.set(results ? { type: 'pose', landmarks: results.poseLandmarks } : null);
}

function _handleDetectionError(error) {
  console.error('Error in pose detection:', error);

  try {
    _pose?.onResults(null);
  } catch {}
  try {
    _pose?.close();
  } catch {}

  _pose = null;
  _poseState = POSE_STATE_INITIALIZING;
  _isProcessing = false;
  _results = null;

  drawResults();
  landmarksOut.set(null);
  _initPose(); // restart
}

function drawResults() {
  if (!imageIn.value) return;

  const width = imageIn.value.width;
  const height = imageIn.value.height;

  _ctx.clearRect(0, 0, width, height);
  _ctx.fillStyle = figment.toCanvasColor(backgroundIn.value);
  _ctx.fillRect(0, 0, width, height);

  if (_results && _results.poseLandmarks) {
    detectedOut.set(true);

    if (linesToggleIn.value) {
      drawConnectors(_ctx, _results.poseLandmarks, POSE_CONNECTIONS, {
        color: figment.toCanvasColor(linesColorIn.value),
        lineWidth: linesWidthIn.value,
        visibilityMin: 0,
      });
    }
    if (pointsToggleIn.value) {
      drawLandmarks(_ctx, _results.poseLandmarks, {
        color: figment.toCanvasColor(pointsColorIn.value),
        lineWidth: pointsRadiusIn.value,
      });
    }
  } else {
    detectedOut.set(false);
  }

  window.gl.bindTexture(gl.TEXTURE_2D, _framebuffer.texture);
  window.gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, _canvas);
  window.gl.bindTexture(gl.TEXTURE_2D, null);
  imageOut.set(_framebuffer);
}
