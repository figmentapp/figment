/**
 * @name Detect Faces
 * @description Detect faces in an image and draw their landmarks.
 * @category ml
 */

// Runs MediaPipe's face models natively on the GPU (see
// src/mediapipe-gpu.js); only landmarks (~6 KB per face) are read back each
// frame. The overlay is drawn on the GPU as well (src/landmark-drawing.js).

const imageIn = node.imageIn('in');
const backgroundIn = node.colorIn('background', [0, 0, 0, 1]);
const drawModeIn = node.selectIn('draw mode', ['contours', 'tesselation', 'bounding box'], 'contours');
const drawColorIn = node.colorIn('draw color', [255, 255, 255, 1]);
const drawLineWidthIn = node.numberIn('line width', 1, { min: 0, max: 10, step: 0.1 });
const numFacesIn = node.numberIn('number of faces', 1, { min: 1, max: figment.MEDIAPIPE_MAX_INSTANCES, step: 1 });
const confidenceIn = node.numberIn('confidence', 0.5, { min: 0, max: 1, step: 0.01 });
const modeIn = node.selectIn('mode', ['video', 'still'], 'video');

const imageOut = node.imageOut('out');
const detectedOut = node.booleanOut('detected');
const landmarksOut = node.objectOut('landmarks');

drawColorIn.label = 'Color';
drawLineWidthIn.label = 'Line Width';

let _target, _overlay;
let _faces = null;

node.onStart = async () => {
  _target = new figment.RenderTarget({ label: 'detectFaces' });
  _overlay = new figment.LandmarkRenderer({ label: 'detectFaces' });
  _faces = new figment.FaceGpuPipeline({ maxInstances: numFacesIn.value, confidence: confidenceIn.value });
  _faces.tracking = modeIn.value === 'video';
  await _faces.init();
};

node.onRender = async () => {
  if (!imageIn.value || !_faces) return;
  const width = imageIn.value.width;
  const height = imageIn.value.height;

  const results = await _faces.process(imageIn.value);
  if (!_faces) return; // stopped while the frame was in flight
  drawResults(
    results.map((r) => r.landmarks),
    width,
    height,
  );
};

node.onReset = () => {
  if (_faces) _faces.resetTracking();
};

node.onStop = () => {
  if (_faces) _faces.destroy();
  _faces = null;
  _target?.destroy();
  _overlay?.destroy();
};

function drawResults(faceLandmarks, width, height) {
  const batch = _overlay.begin(width, height);

  if (faceLandmarks.length > 0) {
    detectedOut.value = true;
    landmarksOut.value = { type: 'face', landmarks: faceLandmarks };

    const options = { color: drawColorIn.value, lineWidth: drawLineWidthIn.value };

    for (const landmarks of faceLandmarks) {
      switch (drawModeIn.value) {
        case 'contours':
          batch.connectors(landmarks, figment.FACE_LANDMARKS_CONTOURS, options);
          break;
        case 'tesselation':
          batch.connectors(landmarks, figment.FACE_LANDMARKS_TESSELATION, options);
          break;
        case 'bounding box': {
          let minX = Infinity,
            minY = Infinity,
            maxX = -Infinity,
            maxY = -Infinity;
          for (const landmark of landmarks) {
            minX = Math.min(minX, landmark.x);
            minY = Math.min(minY, landmark.y);
            maxX = Math.max(maxX, landmark.x);
            maxY = Math.max(maxY, landmark.y);
          }
          batch.rect(minX, minY, maxX - minX, maxY - minY, options);
          break;
        }
      }
    }
  } else {
    detectedOut.value = false;
    landmarksOut.value = null;
  }

  _overlay.draw(_target, backgroundIn.value);
  imageOut.set(_target);
}

function updateOptions() {
  if (!_faces) return;
  _faces.maxInstances = numFacesIn.value;
  _faces.confidence = confidenceIn.value;
  _faces.tracking = modeIn.value === 'video';
}

numFacesIn.onChange = updateOptions;
confidenceIn.onChange = updateOptions;
modeIn.onChange = updateOptions;
