/**
 * @name Detect Hands
 * @description Detect hands in an image and draw them as skeletons.
 * @category ml
 */

// Runs MediaPipe's hand models natively on the GPU (see
// src/mediapipe-gpu.js); only landmarks (~1 KB per hand) are read back each
// frame. The skeleton is drawn on the GPU as well (src/landmark-drawing.js).

const imageIn = node.imageIn('in');
const backgroundIn = node.colorIn('background', [0, 0, 0, 1]);
const coloringIn = node.selectIn('coloring', ['solid', 'per hand', 'per finger'], 'solid');
const pointsToggleIn = node.toggleIn('draw points', true);
const pointsColorIn = node.colorIn('points color', [255, 255, 255, 1]);
const pointsRadiusIn = node.numberIn('points radius', 2, { min: 0, max: 20, step: 0.1 });
const linesToggleIn = node.toggleIn('draw lines', true);
const linesColorIn = node.colorIn('lines color', [255, 255, 255, 1]);
const linesWidthIn = node.numberIn('lines width', 2, { min: 0, max: 20, step: 0.1 });
const numHandsIn = node.numberIn('number of hands', 2, { min: 1, max: figment.MEDIAPIPE_MAX_INSTANCES, step: 1 });
const confidenceIn = node.numberIn('confidence', 0.5, { min: 0, max: 1, step: 0.01 });

const imageOut = node.imageOut('out');
const detectedOut = node.booleanOut('detected');
const landmarksOut = node.objectOut('landmarks');

pointsColorIn.label = 'Color';
pointsRadiusIn.label = 'Radius';
linesColorIn.label = 'Color';
linesWidthIn.label = 'Line Width';

let _target, _overlay;
let _hands = null;

node.onStart = async () => {
  _target = new figment.RenderTarget({ label: 'detectHands' });
  _overlay = new figment.LandmarkRenderer({ label: 'detectHands' });
  _hands = new figment.HandGpuPipeline({ maxInstances: numHandsIn.value, confidence: confidenceIn.value });
  await _hands.init();
};

node.onRender = async () => {
  if (!imageIn.value || !_hands) return;
  const width = imageIn.value.width;
  const height = imageIn.value.height;

  const results = await _hands.process(imageIn.value);
  if (!_hands) return; // stopped while the frame was in flight
  drawResults(results, width, height);
};

function drawResults(results, width, height) {
  const batch = _overlay.begin(width, height);

  if (results.length > 0) {
    detectedOut.value = true;
    landmarksOut.value = {
      type: 'hand',
      landmarks: results.map((r) => r.landmarks),
      handedness: results.map((r) => r.handedness),
      worldLandmarks: results.map((r) => r.worldLandmarks),
    };

    for (const { landmarks, handedness } of results) {
      const [pointsColor, linesColor] = handColors(handedness[0].categoryName);
      if (linesToggleIn.value) {
        batch.connectors(landmarks, figment.HAND_CONNECTIONS, { color: linesColor, lineWidth: linesWidthIn.value });
      }
      if (pointsToggleIn.value) {
        batch.landmarks(landmarks, { color: pointsColor, radius: pointsRadiusIn.value });
      }
    }
  } else {
    detectedOut.value = false;
    landmarksOut.value = null;
  }

  _overlay.draw(_target, backgroundIn.value);
  imageOut.set(_target);
}

// The [points, lines] colors for a hand of the given handedness ('Right' or
// 'Left'). Per-hand and per-finger coloring use fixed hues so that an
// image-to-image model trained on these drawings can tell the hands, and
// the fingers, apart; the points and lines colors are ignored then.
function handColors(side) {
  switch (coloringIn.value) {
    case 'per hand':
      return [figment.HAND_COLORS[side], figment.HAND_COLORS[side]];
    case 'per finger':
      return [figment.HAND_LANDMARK_COLORS[side], figment.HAND_CONNECTION_COLORS[side]];
    default:
      return [pointsColorIn.value, linesColorIn.value];
  }
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
  _overlay?.destroy();
};
