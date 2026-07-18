/**
 * @name Detect Faces
 * @description Detect faces in an image using MediaPipe
 * @category ml
 */

// Runs the MediaPipe face models natively on the GPU (see
// src/mediapipe-gpu.js); only landmarks (~6 KB per face) are read back each
// frame. Drawing still uses MediaPipe's canvas DrawingUtils, which is pure
// vector drawing (no frame readback).

const imageIn = node.imageIn('in');
const backgroundIn = node.colorIn('background', [0, 0, 0, 1]);
const drawModeIn = node.selectIn('draw mode', ['contours', 'tesselation', 'bounding box'], 'contours');
const drawColorIn = node.colorIn('draw color', [255, 255, 255, 1]);
const drawLineWidthIn = node.numberIn('line width', 1, { min: 0, max: 10, step: 0.1 });
const numFacesIn = node.numberIn('number of faces', 1, { min: 1, max: 4, step: 1 });
const confidenceIn = node.numberIn('confidence', 0.5, { min: 0, max: 1, step: 0.01 });

const imageOut = node.imageOut('out');
const detectedOut = node.booleanOut('detected');
const landmarksOut = node.objectOut('landmarks');

drawColorIn.label = 'Color';
drawLineWidthIn.label = 'Line Width';

let _target, _canvas, _ctx;
let _drawingUtils;
let _faces = null;
let _busy = false;

node.onStart = async () => {
  _target = new figment.RenderTarget({ label: 'detectFaces' });
  _canvas = new OffscreenCanvas(1, 1);
  _ctx = _canvas.getContext('2d');
  _drawingUtils = new mediapipe.DrawingUtils(_ctx);
  _faces = new figment.FaceGpuPipeline({ maxInstances: numFacesIn.value, confidence: confidenceIn.value });
  await _faces.init();
};

node.onRender = async () => {
  if (!imageIn.value || !_faces || _busy) return;
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
    results = await _faces.process(imageIn.value);
  } catch (err) {
    node.error = err && err.stack ? err.stack : String(err);
    return;
  } finally {
    _busy = false;
  }
  drawResults(results.map((r) => r.landmarks));
};

node.onStop = () => {
  if (_faces) _faces.destroy();
  _faces = null;
  _target?.destroy();
};

function drawResults(faceLandmarks) {
  const width = _canvas.width;
  const height = _canvas.height;

  _ctx.clearRect(0, 0, width, height);
  _ctx.fillStyle = figment.toCanvasColor(backgroundIn.value);
  _ctx.fillRect(0, 0, width, height);

  if (faceLandmarks.length > 0) {
    detectedOut.value = true;
    landmarksOut.value = { type: 'face', landmarks: faceLandmarks };

    const options = {
      color: figment.toCanvasColor(drawColorIn.value),
      lineWidth: drawLineWidthIn.value,
    };

    for (const landmarks of faceLandmarks) {
      switch (drawModeIn.value) {
        case 'contours':
          _drawingUtils.drawConnectors(landmarks, mediapipe.FaceLandmarker.FACE_LANDMARKS_CONTOURS, options);
          break;
        case 'tesselation':
          _drawingUtils.drawConnectors(landmarks, mediapipe.FaceLandmarker.FACE_LANDMARKS_TESSELATION, options);
          break;
        case 'bounding box':
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

          _ctx.strokeStyle = figment.toCanvasColor(drawColorIn.value);
          _ctx.lineWidth = drawLineWidthIn.value;
          _ctx.strokeRect(minX * width, minY * height, (maxX - minX) * width, (maxY - minY) * height);
          break;
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
  if (!_faces) return;
  _faces.maxInstances = numFacesIn.value;
  _faces.confidence = confidenceIn.value;
}

numFacesIn.onChange = updateOptions;
confidenceIn.onChange = updateOptions;
