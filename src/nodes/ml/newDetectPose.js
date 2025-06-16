/**
 * @name New Detect Pose
 * @description Detect pose in an image using MediaPipe
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
const numPosesIn = node.numberIn('number of poses', 4, { min: 1, max: 4, step: 1 });

const imageOut = node.imageOut('out');
const detectedOut = node.booleanOut('detected');
const landmarksOut = node.objectOut('landmarks');

pointsColorIn.label = 'Color';
pointsRadiusIn.label = 'Radius';
linesColorIn.label = 'Color';
linesWidthIn.label = 'Line Width';

let _vision, _poseLandmarker;
let _framebuffer, _canvas, _ctx, _imageData;
let _drawingUtils;
let _initialising = false;

async function initLandmarker() {
  if (_initialising) return;
  _initialising = true;
  if (_poseLandmarker) {
    await _poseLandmarker.close();
  }

  _poseLandmarker = await mediapipe.PoseLandmarker.createFromOptions(
    _vision,
    {
      baseOptions: {
        // modelAssetPath: "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task",
        modelAssetPath: "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_full/float16/latest/pose_landmarker_full.task",
        // modelAssetPath: "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_heavy/float16/latest/pose_landmarker_heavy.task",
        delegate: "GPU"
      },
      runningMode: 'IMAGE',
      numPoses: numPosesIn.value,
    }
  );
  _initialising = false;
}

node.onStart = async () => {
  _framebuffer = new figment.Framebuffer();
  _canvas = new OffscreenCanvas(1, 1);
  _ctx = _canvas.getContext('2d');
  _drawingUtils = new mediapipe.DrawingUtils(_ctx);

  _vision = await mediapipe.FilesetResolver.forVisionTasks("https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.0/wasm");
  await initLandmarker();
};

numPosesIn.onChange = async () => {
  await initLandmarker();
};

node.onRender = () => {
  if (!imageIn.value || _initialising) return;
  const width = imageIn.value.width;
  const height = imageIn.value.height;

  if (width !== _canvas.width || height !== _canvas.height) {
    _canvas.width = width;
    _canvas.height = height;
    _imageData = new ImageData(width, height);
    _framebuffer.setSize(width, height);
  }

  imageIn.value.bind();
  window.gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, _imageData.data);
  imageIn.value.unbind();

  const pose = _poseLandmarker.detect(_imageData);
  drawResults(pose);
};

function drawResults(pose) {
  if (!imageIn.value || !pose) return;
  const width = imageIn.value.width;
  const height = imageIn.value.height;

  _ctx.clearRect(0, 0, width, height);
  _ctx.fillStyle = figment.toCanvasColor(backgroundIn.value);
  _ctx.fillRect(0, 0, width, height);

  if (pose.landmarks && pose.landmarks.length > 0) {
    detectedOut.value = true;
    landmarksOut.value = pose.landmarks;

    for (const landmark of pose.landmarks) {
      if (pointsToggleIn.value) {
        const options = {
          color: figment.toCanvasColor(pointsColorIn.value),
          radius: pointsRadiusIn.value,
        }
        _drawingUtils.drawLandmarks(landmark, options);
      }

      if (linesToggleIn.value) {
        const options = {
          color: figment.toCanvasColor(linesColorIn.value),
          lineWidth: linesWidthIn.value,
        }
        _drawingUtils.drawConnectors(landmark, mediapipe.PoseLandmarker.POSE_CONNECTIONS, options);
      }
    }
  } else {
    detectedOut.value = false;
    landmarksOut.value = null;
  }

  window.gl.bindTexture(gl.TEXTURE_2D, _framebuffer.texture);
  window.gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, _canvas);
  window.gl.bindTexture(gl.TEXTURE_2D, null);
  imageOut.value = _framebuffer;
}