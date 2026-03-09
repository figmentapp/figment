/**
 * @name Detect Hands
 * @description Detect hands in an image using MediaPipe
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
  _target = new figment.RenderTarget({ label: 'detectHands' });
  _canvas = new OffscreenCanvas(1, 1);
  _ctx = _canvas.getContext('2d');
  _drawingUtils = new mediapipe.DrawingUtils(_ctx);
  _readback = figment.createTextureReadback();
  _mpClient = new figment.MediaPipeWorkerClient('hands', {
    taskFile: 'hand_landmarker.task',
    taskOptions: {
      runningMode: 'IMAGE',
      numHands: numHandsIn.value,
      minHandDetectionConfidence: confidenceIn.value,
      minHandPresenceConfidence: confidenceIn.value,
      minTrackingConfidence: confidenceIn.value,
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
    await measureAsyncPhase('mediapipe:hands:input-readback', () => _readback.read(imageIn.value, frame));
    const r = await measureAsyncPhase('mediapipe:hands:infer', () => _mpClient.inferRgba(frame, width, height));
    drawResults({ landmarks: r.landmarks, worldLandmarks: r.worldLandmarks, handednesses: r.handednesses });
  } catch (_) {
    // reinit/terminate during rapid param changes; ignore frame
  }
};

function drawResults(handResult) {
  if (!imageIn.value || !handResult) return;
  const width = imageIn.value.width;
  const height = imageIn.value.height;

  _ctx.clearRect(0, 0, width, height);
  _ctx.fillStyle = figment.toCanvasColor(backgroundIn.value);
  _ctx.fillRect(0, 0, width, height);

  if (handResult.landmarks && handResult.landmarks.length > 0) {
    detectedOut.value = true;
    landmarksOut.value = {
      type: 'hand',
      landmarks: handResult.landmarks,
      handedness: handResult.handednesses,
      worldLandmarks: handResult.worldLandmarks,
    };

    for (const landmarks of handResult.landmarks) {
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
  if (_mpClient) {
    _mpClient.setOptions({
      numHands: numHandsIn.value,
      minHandDetectionConfidence: confidenceIn.value,
      minHandPresenceConfidence: confidenceIn.value,
      minTrackingConfidence: confidenceIn.value,
    });
  }
}

numHandsIn.onChange = updateOptions;
confidenceIn.onChange = updateOptions;

node.onStop = () => {
  if (_mpClient) _mpClient.terminate();
  _mpClient = null;
  _readback?.destroy();
  _readback = null;
  _target?.destroy();
};
