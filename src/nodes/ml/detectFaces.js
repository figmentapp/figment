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

let _vision, _faceLandmarker;
let _framebuffer, _canvas, _ctx, _imageData;
let _drawingUtils;
let _initialising = false;

async function initLandmarker() {
  if (_initialising) return;
  _initialising = true;
  if (_faceLandmarker) {
    await _faceLandmarker.close();
  }

  _faceLandmarker = await mediapipe.FaceLandmarker.createFromOptions(_vision, {
    baseOptions: {
      modelAssetPath: './mediapipe/face_landmarker.task',
      delegate: 'GPU',
    },
    runningMode: 'IMAGE',
    numFaces: numFacesIn.value,
    minFaceDetectionConfidence: confidenceIn.value,
    minFacePresenceConfidence: confidenceIn.value,
    minTrackingConfidence: confidenceIn.value,
    outputFaceBlendshapes: false,
    outputFacialTransformationMatrixes: false,
  });
  _initialising = false;
}

node.onStart = async () => {
  _framebuffer = new figment.Framebuffer();
  _canvas = new OffscreenCanvas(1, 1);
  _ctx = _canvas.getContext('2d');
  _drawingUtils = new mediapipe.DrawingUtils(_ctx);
  _vision = await mediapipe.FilesetResolver.forVisionTasks('./mediapipe');
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

  const faceResult = _faceLandmarker.detect(_imageData);
  drawResults(faceResult);
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

  window.gl.bindTexture(gl.TEXTURE_2D, _framebuffer.texture);
  window.gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, _canvas);
  window.gl.bindTexture(gl.TEXTURE_2D, null);
  imageOut.value = _framebuffer;
}

numFacesIn.onChange = initLandmarker;
confidenceIn.onChange = initLandmarker;
