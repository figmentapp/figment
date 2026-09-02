/**
 * @name Detect Pose
 * @description Detect poses in an image and draw them as skeletons.
 * @category ml
 */

// Runs MediaPipe's pose models natively on the GPU (see
// src/mediapipe-gpu.js); only landmarks (~1 KB per pose) are read back each
// frame. The skeleton is drawn on the GPU as well (src/landmark-drawing.js).

const imageIn = node.imageIn('in');
const backgroundIn = node.colorIn('background', [0, 0, 0, 1]);
const coloringIn = node.selectIn('coloring', ['solid', 'per limb'], 'solid');
const pointsToggleIn = node.toggleIn('draw points', true);
const pointsColorIn = node.colorIn('points color', [255, 255, 255, 1]);
const pointsRadiusIn = node.numberIn('points radius', 2, { min: 0, max: 20, step: 0.1 });
const linesToggleIn = node.toggleIn('draw lines', true);
const linesColorIn = node.colorIn('lines color', [255, 255, 255, 1]);
const linesWidthIn = node.numberIn('lines width', 2, { min: 0, max: 20, step: 0.1 });
const numPosesIn = node.numberIn('number of poses', 4, { min: 1, max: figment.MEDIAPIPE_MAX_INSTANCES, step: 1 });
const modelIn = node.selectIn('model', ['lite', 'full', 'heavy'], 'lite');
const modeIn = node.selectIn('mode', ['video', 'still'], 'video');
const smoothingIn = node.numberIn('smoothing', 0, { min: 0, max: 1, step: 0.01 });

const imageOut = node.imageOut('out');
const detectedOut = node.booleanOut('detected');
const landmarksOut = node.objectOut('landmarks');

pointsColorIn.label = 'Color';
pointsRadiusIn.label = 'Radius';
linesColorIn.label = 'Color';
linesWidthIn.label = 'Line Width';

let _target, _overlay;
let _pose = null;

node.onStart = async () => {
  _target = new figment.RenderTarget({ label: 'detectPose' });
  _overlay = new figment.LandmarkRenderer({ label: 'detectPose' });
  _pose = new figment.PoseGpuPipeline({ model: modelIn.value, maxInstances: numPosesIn.value });
  updateMode();
  await _pose.init();
};

node.onRender = async () => {
  if (!imageIn.value || !_pose) return;
  const width = imageIn.value.width;
  const height = imageIn.value.height;

  const results = await _pose.process(imageIn.value);
  if (!_pose) return; // stopped while the frame was in flight
  drawResults(
    results.map((r) => r.landmarks),
    width,
    height,
  );
};

function drawResults(poseLandmarks, width, height) {
  const batch = _overlay.begin(width, height);

  if (poseLandmarks.length > 0) {
    detectedOut.value = true;
    landmarksOut.value = { type: 'pose', landmarks: poseLandmarks };

    // Per-limb coloring gives every landmark and limb a fixed hue (the
    // OpenPose palette), so an image-to-image model trained on these
    // drawings can tell limbs and sides apart. The points and lines colors
    // are ignored in that mode.
    const perLimb = coloringIn.value === 'per limb';
    const pointsColor = perLimb ? figment.POSE_LANDMARK_COLORS : pointsColorIn.value;
    const linesColor = perLimb ? figment.POSE_CONNECTION_COLORS : linesColorIn.value;
    for (const landmarks of poseLandmarks) {
      if (pointsToggleIn.value) {
        batch.landmarks(landmarks, { color: pointsColor, radius: pointsRadiusIn.value });
      }
      if (linesToggleIn.value) {
        batch.connectors(landmarks, figment.POSE_CONNECTIONS, { color: linesColor, lineWidth: linesWidthIn.value });
      }
    }
  } else {
    detectedOut.value = false;
    landmarksOut.value = null;
  }

  _overlay.draw(_target, backgroundIn.value);
  imageOut.set(_target);
}

numPosesIn.onChange = () => {
  if (_pose) _pose.maxInstances = numPosesIn.value;
};

// Smoothing needs consecutive frames: it only applies in video mode.
function updateMode() {
  if (!_pose) return;
  const video = modeIn.value === 'video';
  _pose.tracking = video;
  _pose.smoothing = video ? smoothingIn.value : 0;
}

modeIn.onChange = updateMode;
smoothingIn.onChange = updateMode;

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
  _overlay?.destroy();
};
