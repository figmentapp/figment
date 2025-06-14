/**
 * @name Detect Faces
 * @description Detect faces in an image using FaceMesh
 * @category ml
 */

const imageIn = node.imageIn('in');
const backgroundIn = node.colorIn('background', [0, 0, 0, 1]);
const contoursToggleIn = node.toggleIn('draw contours', true);
const contoursColorIn = node.colorIn('contours color', [255, 255, 255, 1]);
const contoursLineWidthIn = node.numberIn('contours line width', 1, { min: 0, max: 10, step: 0.1 });
const tesselationToggleIn = node.toggleIn('draw tesselation', false);
const tesselationColorIn = node.colorIn('tesselation color', [255, 255, 255, 1]);
const tesselationLineWidthIn = node.numberIn('tesselation line width', 1, { min: 0, max: 10, step: 0.1 });
const bboxToggleIn = node.toggleIn('draw bounding box', false);
const bboxColorIn = node.colorIn('bounding box color', [255, 255, 255, 1]);
const bboxLineWidthIn = node.numberIn('bounding box line width', 1, { min: 0, max: 10, step: 0.1 });
contoursColorIn.label = 'color';
tesselationColorIn.label = 'color';
bboxColorIn.label = 'color';
contoursLineWidthIn.label = 'line width';
tesselationLineWidthIn.label = 'line width';
bboxLineWidthIn.label = 'line width';

const imageOut = node.imageOut('out');
const detectedOut = node.booleanOut('detected');
const landmarksOut = node.objectOut('landmarks');

let _faceMesh, _canvas, _ctx, _framebuffer, _imageData, _results, _isProcessing;

node.onStart = async () => {
  _framebuffer = new figment.Framebuffer();
  _canvas = new OffscreenCanvas(1, 1);
  _ctx = _canvas.getContext('2d');
  await figment.loadScripts(['./mediapipe/drawing_utils.js', './mediapipe/face_mesh.js']);
  _faceMesh = new FaceMesh({
    locateFile: (file) => {
      return `./mediapipe/${file}`;
    },
  });
  _faceMesh.setOptions({
    maxNumFaces: 1,
    refineLandmarks: true,
    minDetectionConfidence: 0.5,
    minTrackingConfidence: 0.5,
  });
};

function _detect(image) {
  // Check if only one image is processed at the same time.
  if (_isProcessing) return;
  return new Promise((resolve) => {
    _isProcessing = true;
    try {
      _faceMesh.onResults((results) => {
        _faceMesh.onResults(null);
        _isProcessing = false;
        resolve(results);
      });
      _faceMesh.send({ image });
    } catch (err) {
      console.error('Error in face detection:', err);
      _isProcessing = false;
      resolve(null);
    }
  });
}

node.onRender = async () => {
  if (!imageIn.value || imageIn.value.width === 0 || imageIn.value.height === 0) return;
  if (!_faceMesh) return;

  // Draw the image on an ImageData object.
  const width = imageIn.value.width;
  const height = imageIn.value.height;

  if (width !== _canvas.width || height !== _canvas.height) {
    _canvas.width = width;
    _canvas.height = height;
    _imageData = new ImageData(width, height);
    _framebuffer.setSize(width, height);
  }

  // Video nodes pass along this extra object with the framebuffer.
  // This allows mediapose to avoid reading the texture first from the framebuffer.
  if (imageIn.value._directImageHack) {
    _results = await _detect(imageIn.value._directImageHack);
  } else {
    imageIn.value.bind();
    window.gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, _imageData.data);
    imageIn.value.unbind();
    _results = await _detect(_imageData);
  }
  drawResults();
  landmarksOut.set(_results ? { type: 'face', landmarks: _results.multiFaceLandmarks } : null);
};

function drawResults() {
  if (!imageIn.value || imageIn.value.width === 0 || imageIn.value.height === 0) return;
  if (!_results) return;
  const width = imageIn.value.width;
  const height = imageIn.value.height;
  _ctx.clearRect(0, 0, width, height);
  _ctx.fillStyle = figment.toCanvasColor(backgroundIn.value);
  _ctx.fillRect(0, 0, width, height);
  if (_results.multiFaceLandmarks) {
    detectedOut.set(_results.multiFaceLandmarks.length > 0);
    for (const landmarks of _results.multiFaceLandmarks) {
      if (contoursToggleIn.value) {
        drawConnectors(_ctx, landmarks, FACEMESH_CONTOURS, {
          color: figment.toCanvasColor(contoursColorIn.value),
          lineWidth: contoursLineWidthIn.value,
        });
      }
      if (tesselationToggleIn.value) {
        drawConnectors(_ctx, landmarks, FACEMESH_TESSELATION, {
          color: figment.toCanvasColor(tesselationColorIn.value),
          lineWidth: tesselationLineWidthIn.value,
        });
      }
      if (bboxToggleIn.value) {
        let minX, minY, maxX, maxY;
        for (let i = 0; i < landmarks.length; i++) {
          if (i === 0) {
            minX = maxX = landmarks[i].x;
            minY = maxY = landmarks[i].y;
          } else {
            minX = Math.min(minX, landmarks[i].x);
            minY = Math.min(minY, landmarks[i].y);
            maxX = Math.max(maxX, landmarks[i].x);
            maxY = Math.max(maxY, landmarks[i].y);
          }
        }
        _ctx.strokeStyle = figment.toCanvasColor(bboxColorIn.value);
        _ctx.lineWidth = bboxLineWidthIn.value;
        _ctx.strokeRect(minX * width, minY * height, (maxX - minX) * width, (maxY - minY) * height);
      }
      //drawConnectors(canvasCtx, landmarks, FACEMESH_RIGHT_EYE, {color: '#FF3030'});
    }
  } else {
    console.log('no faces');
    detectedOut.set(false);
  }
  window.gl.bindTexture(gl.TEXTURE_2D, _framebuffer.texture);
  window.gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, _canvas);
  window.gl.bindTexture(gl.TEXTURE_2D, null);
  imageOut.set(_framebuffer);
}

// imageIn.onChange = detectFaces;
// backgroundIn.onChange = drawResults;
// tesselationToggleIn.onChange = drawResults;
// tesselationColorIn.onChange = drawResults;
// tesselationLineWidthIn.onChange = drawResults;
// contoursToggleIn.onChange = drawResults;
// contoursColorIn.onChange = drawResults;
// contoursLineWidthIn.onChange = drawResults;
