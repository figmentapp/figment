/**
 * @name Detect Faces
 * @description Detect faces in an image using MediaPipe
 * @category ml
 */

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
let _mpClient = null;
let _readback = null;
let _profileSequence = 0;

async function measureAsyncPhase(name, fn) {
  const id = _profileSequence++;
  const startMark = `${name}:start:${id}`;
  const endMark = `${name}:end:${id}`;
  performance.mark(startMark);
  try {
    return await fn();
  } finally {
    performance.mark(endMark);
    try {
      performance.measure(name, startMark, endMark);
    } catch (_) {}
  }
}

node.onStart = async () => {
  _target = new figment.RenderTarget({ label: 'detectFaces' });
  _canvas = new OffscreenCanvas(1, 1);
  _ctx = _canvas.getContext('2d');
  _drawingUtils = new mediapipe.DrawingUtils(_ctx);
  _readback = figment.createTextureReadback();
  _mpClient = new figment.MediaPipeWorkerClient('face', {
    taskFile: 'face_landmarker.task',
    taskOptions: {
      runningMode: 'IMAGE',
      numFaces: numFacesIn.value,
      minFaceDetectionConfidence: confidenceIn.value,
      minFacePresenceConfidence: confidenceIn.value,
      minTrackingConfidence: confidenceIn.value,
      outputFaceBlendshapes: false,
      outputFacialTransformationMatrixes: false,
    },
  });
};

node.onRender = async () => {
  if (!imageIn.value) return;
  const width = imageIn.value.width;
  const height = imageIn.value.height;

  if (width !== _canvas.width || height !== _canvas.height) {
    _canvas.width = width;
    _canvas.height = height;
    _target.setSize(width, height);
  }

  try {
    const frame = _mpClient.borrowFrame(width, height);
    await measureAsyncPhase('mediapipe:face:input-readback', () => _readback.read(imageIn.value, frame));
    const res = await measureAsyncPhase('mediapipe:face:infer', () => _mpClient.inferRgba(frame, width, height));
    drawResults({ faceLandmarks: res.faceLandmarks });
  } catch (_) {
    // reinit/terminate during rapid param changes; ignore frame
  }
};

node.onStop = () => {
  if (_mpClient) _mpClient.terminate();
  _mpClient = null;
  _readback?.destroy();
  _readback = null;
  _target?.destroy();
};

function drawResults(faceResult) {
  if (!imageIn.value || !faceResult) return;
  const width = imageIn.value.width;
  const height = imageIn.value.height;

  _ctx.clearRect(0, 0, width, height);
  _ctx.fillStyle = figment.toCanvasColor(backgroundIn.value);
  _ctx.fillRect(0, 0, width, height);

  if (faceResult.faceLandmarks && faceResult.faceLandmarks.length > 0) {
    detectedOut.value = true;
    landmarksOut.value = { type: 'face', landmarks: faceResult.faceLandmarks };

    const options = {
      color: figment.toCanvasColor(drawColorIn.value),
      lineWidth: drawLineWidthIn.value,
    };

    for (const landmarks of faceResult.faceLandmarks) {
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
  if (_mpClient) {
    _mpClient.setOptions({
      numFaces: numFacesIn.value,
      minFaceDetectionConfidence: confidenceIn.value,
      minFacePresenceConfidence: confidenceIn.value,
      minTrackingConfidence: confidenceIn.value,
    });
  }
}

numFacesIn.onChange = updateOptions;
confidenceIn.onChange = updateOptions;
