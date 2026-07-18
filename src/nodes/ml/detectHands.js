/**
 * @name Detect Hands
 * @description Detect hands in an image using MediaPipe
 * @category ml
 */

// Runs the MediaPipe hand models natively on the GPU (see
// src/mediapipe-gpu.js); only landmarks (~1 KB per hand) are read back each
// frame. Drawing still uses MediaPipe's canvas DrawingUtils, which is pure
// vector drawing (no frame readback).

const imageIn = node.imageIn('in');
const backgroundIn = node.colorIn('background', [0, 0, 0, 1]);
const pointsToggleIn = node.toggleIn('draw points', true);
const pointsColorIn = node.colorIn('points color', [255, 255, 255, 1]);
const pointsRadiusIn = node.numberIn('points radius', 2, { min: 0, max: 20, step: 0.1 });
const linesToggleIn = node.toggleIn('draw lines', true);
const linesColorIn = node.colorIn('lines color', [255, 255, 255, 1]);
const linesWidthIn = node.numberIn('lines width', 2, { min: 0, max: 20, step: 0.1 });
const numHandsIn = node.numberIn('number of hands', 2, { min: 1, max: 4, step: 1 });
const confidenceIn = node.numberIn('confidence', 0.5, { min: 0, max: 1, step: 0.01 });

const imageOut = node.imageOut('out');
const detectedOut = node.booleanOut('detected');
const landmarksOut = node.objectOut('landmarks');

pointsColorIn.label = 'Color';
pointsRadiusIn.label = 'Radius';
linesColorIn.label = 'Color';
linesWidthIn.label = 'Line Width';

let _target, _canvas, _ctx;
let _drawingUtils;
let _hands = null;
let _busy = false;

node.onStart = async () => {
  _target = new figment.RenderTarget({ label: 'detectHands' });
  _canvas = new OffscreenCanvas(1, 1);
  _ctx = _canvas.getContext('2d');
  _drawingUtils = new mediapipe.DrawingUtils(_ctx);
  _hands = new figment.HandGpuPipeline({ maxInstances: numHandsIn.value, confidence: confidenceIn.value });
  await _hands.init();
};

node.onRender = async () => {
  if (!imageIn.value || !_hands || _busy) return;
  const width = imageIn.value.width;
  const height = imageIn.value.height;

  if (width !== _canvas.width || height !== _canvas.height) {
    _canvas.width = width;
    _canvas.height = height;
    _target.setSize(width, height);
  }

  _busy = true;
  let results;
  try {
    results = await _hands.process(imageIn.value);
  } catch (err) {
    node.error = err && err.stack ? err.stack : String(err);
    return;
  } finally {
    _busy = false;
  }
  drawResults(results);
};

function drawResults(results) {
  const width = _canvas.width;
  const height = _canvas.height;

  _ctx.clearRect(0, 0, width, height);
  _ctx.fillStyle = figment.toCanvasColor(backgroundIn.value);
  _ctx.fillRect(0, 0, width, height);

  if (results.length > 0) {
    detectedOut.value = true;
    landmarksOut.value = {
      type: 'hand',
      landmarks: results.map((r) => r.landmarks),
      handedness: results.map((r) => r.handedness),
      worldLandmarks: results.map((r) => r.worldLandmarks),
    };

    for (const { landmarks } of results) {
      if (linesToggleIn.value) {
        const options = {
          color: figment.toCanvasColor(linesColorIn.value),
          lineWidth: linesWidthIn.value,
        };
        _drawingUtils.drawConnectors(landmarks, mediapipe.HandLandmarker.HAND_CONNECTIONS, options);
      }

      if (pointsToggleIn.value) {
        const options = {
          color: figment.toCanvasColor(pointsColorIn.value),
          radius: pointsRadiusIn.value,
        };
        _drawingUtils.drawLandmarks(landmarks, options);
      }
    }
  } else {
    detectedOut.value = false;
    landmarksOut.value = null;
  }

  _target.uploadExternal(_canvas);
  imageOut.set(_target);
}

function updateOptions() {
  if (!_hands) return;
  _hands.maxInstances = numHandsIn.value;
  _hands.confidence = confidenceIn.value;
}

numHandsIn.onChange = updateOptions;
confidenceIn.onChange = updateOptions;

node.onStop = () => {
  if (_hands) _hands.destroy();
  _hands = null;
  _target?.destroy();
};
