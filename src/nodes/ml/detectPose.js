/**
 * @name Detect Pose
 * @description Detect poses in an image using MediaPipe
 * @category ml
 */

// Runs the MediaPipe pose models natively on the GPU (see
// src/mediapipe-gpu.js); only landmarks (~1 KB per pose) are read back each
// frame. Drawing uses MediaPipe's canvas DrawingUtils, which is pure
// vector drawing (no frame readback).

const imageIn = node.imageIn('in');
const backgroundIn = node.colorIn('background', [0, 0, 0, 1]);
const pointsToggleIn = node.toggleIn('draw points', true);
const pointsColorIn = node.colorIn('points color', [255, 255, 255, 1]);
const pointsRadiusIn = node.numberIn('points radius', 2, { min: 0, max: 20, step: 0.1 });
const linesToggleIn = node.toggleIn('draw lines', true);
const linesColorIn = node.colorIn('lines color', [255, 255, 255, 1]);
const linesWidthIn = node.numberIn('lines width', 2, { min: 0, max: 20, step: 0.1 });
const numPosesIn = node.numberIn('number of poses', 4, { min: 1, max: figment.MEDIAPIPE_MAX_INSTANCES, step: 1 });
const modelIn = node.selectIn('model', ['lite', 'full', 'heavy'], 'lite');
const modeIn = node.selectIn('mode', ['video', 'still'], 'video');

const imageOut = node.imageOut('out');
const detectedOut = node.booleanOut('detected');
const landmarksOut = node.objectOut('landmarks');

pointsColorIn.label = 'Color';
pointsRadiusIn.label = 'Radius';
linesColorIn.label = 'Color';
linesWidthIn.label = 'Line Width';

let _target, _canvas, _ctx;
let _drawingUtils;
let _pose = null;

node.onStart = async () => {
  _target = new figment.RenderTarget({ label: 'detectPose' });
  _canvas = new OffscreenCanvas(1, 1);
  _ctx = _canvas.getContext('2d');
  _drawingUtils = new mediapipe.DrawingUtils(_ctx);
  _pose = new figment.PoseGpuPipeline({ model: modelIn.value, maxInstances: numPosesIn.value });
  _pose.tracking = modeIn.value === 'video';
  await _pose.init();
};

node.onRender = async () => {
  if (!imageIn.value || !_pose) return;
  const width = imageIn.value.width;
  const height = imageIn.value.height;

  if (width !== _canvas.width || height !== _canvas.height) {
    _canvas.width = width;
    _canvas.height = height;
    _target.setSize(width, height);
  }

  const results = await _pose.process(imageIn.value);
  if (!_pose) return; // stopped while the frame was in flight
  drawResults(results.map((r) => r.landmarks));
};

function drawResults(poseLandmarks) {
  const width = _canvas.width;
  const height = _canvas.height;

  _ctx.clearRect(0, 0, width, height);
  _ctx.fillStyle = figment.toCanvasColor(backgroundIn.value);
  _ctx.fillRect(0, 0, width, height);

  if (poseLandmarks.length > 0) {
    detectedOut.value = true;
    landmarksOut.value = { type: 'pose', landmarks: poseLandmarks };

    for (const landmark of poseLandmarks) {
      if (pointsToggleIn.value) {
        const options = {
          color: figment.toCanvasColor(pointsColorIn.value),
          radius: pointsRadiusIn.value,
        };
        _drawingUtils.drawLandmarks(landmark, options);
      }

      if (linesToggleIn.value) {
        const options = {
          color: figment.toCanvasColor(linesColorIn.value),
          lineWidth: linesWidthIn.value,
        };
        _drawingUtils.drawConnectors(landmark, mediapipe.PoseLandmarker.POSE_CONNECTIONS, options);
      }
    }
  } else {
    detectedOut.value = false;
    landmarksOut.value = null;
  }

  _target.uploadExternal(_canvas);
  imageOut.set(_target);
}

numPosesIn.onChange = () => {
  if (_pose) _pose.maxInstances = numPosesIn.value;
};

modeIn.onChange = () => {
  if (_pose) _pose.tracking = modeIn.value === 'video';
};

modelIn.onChange = async () => {
  if (!_pose) return;
  try {
    await _pose.setModel(modelIn.value);
  } catch (err) {
    console.error(err);
    if (_pose) modelIn.set(_pose.model); // the installed model stays; the select follows it
  }
};

node.onReset = () => {
  if (_pose) _pose.resetTracking();
};

node.onStop = () => {
  if (_pose) _pose.destroy();
  _pose = null;
  _target?.destroy();
};
