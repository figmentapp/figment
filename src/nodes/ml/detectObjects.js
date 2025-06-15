/**
 * @name Detect Objects
 * @description Detect objects in an image.
 * @category ml
 */

const imageIn = node.imageIn('in');
const drawingModeIn = node.selectIn('drawingMode', ['boxes', 'mask']);
const filterIn = node.stringIn('filter', '*');
const imageOut = node.imageOut('out');
const objectsOut = node.stringOut('objects');

let _model, _canvas, _ctx, _framebuffer;

node.onStart = async () => {
  _canvas = document.createElement('canvas');
  _ctx = _canvas.getContext('2d');
  _framebuffer = new figment.Framebuffer(1, 1);
  _model = await figment.loadModel('coco-ssd', 'cocoSsd');
};

function stringToColor(s) {
  let hash = 0;
  for (let i = 0; i < s.length; i++) {
    hash = s.charCodeAt(i) + ((hash << 5) - hash);
    hash |= 0;
  }
  return `rgb(${(hash & 0xff0000) >> 16}, ${(hash & 0x00ff00) >> 8}, ${hash & 0x0000ff})`;
}

const _classLabelCache = {};
const _cachingCanvas = document.createElement('canvas');
const _cachingCtx = _cachingCanvas.getContext('2d');
function drawClassLabel(ctx, className, classColor, x, y) {
  if (_classLabelCache[className]) {
    ctx.putImageData(_classLabelCache[className], x, y);
  } else {
    const textWidth = _cachingCtx.measureText(className).width;
    _cachingCtx.font = '12px sans-serif';
    _cachingCtx.fillStyle = classColor;
    _cachingCtx.fillRect(0, 0, textWidth + 10, 18);
    _cachingCtx.fillStyle = 'white';
    _cachingCtx.fillText(className, 2, 12);
    _classLabelCache[className] = _cachingCtx.getImageData(0, 0, textWidth + 10, 18);
    ctx.putImageData(_classLabelCache[className], x, y);
  }
}

node.onRender = async () => {
  if (!imageIn.value || imageIn.value.width === 0 || imageIn.value.height === 0) return;
  if (!_model) return;
  if (_canvas.width !== imageIn.value.width || _canvas.height !== imageIn.value.height) {
    _canvas.width = imageIn.value.width;
    _canvas.height = imageIn.value.height;
    _framebuffer.setSize(imageIn.value.width, imageIn.value.height);
  }

  const imageData = figment.framebufferToImageData(imageIn.value);
  const predictions = await _model.detect(imageData);
  let filteredPredictions = predictions;
  if (filterIn.value !== '*') {
    const filteredLabels = filterIn.value.split(',').map((s) => s.trim());
    filteredPredictions = predictions.filter((prediction) => filteredLabels.includes(prediction.class));
  }
  _ctx.lineWidth = 2;
  _ctx.font = '12px sans-serif';
  if (drawingModeIn.value === 'boxes') {
    _ctx.putImageData(imageData, 0, 0);
    for (const prediction of filteredPredictions) {
      const classColor = stringToColor(prediction.class);
      _ctx.strokeStyle = classColor;
      _ctx.strokeRect(prediction.bbox[0], prediction.bbox[1], prediction.bbox[2], prediction.bbox[3]);
      drawClassLabel(_ctx, prediction.class, classColor, prediction.bbox[0], prediction.bbox[1]);
    }
  } else if (drawingModeIn.value === 'mask') {
    _ctx.clearRect(0, 0, _canvas.width, _canvas.height);
    for (const prediction of filteredPredictions) {
      const bbox = prediction.bbox;
      _ctx.putImageData(imageData, 0, 0, bbox[0], bbox[1], bbox[2], bbox[3]);
    }
  }

  // console.log('Predictions: ', predictions);
  window.gl.bindTexture(window.gl.TEXTURE_2D, _framebuffer.texture);
  window.gl.texImage2D(window.gl.TEXTURE_2D, 0, window.gl.RGBA, window.gl.RGBA, window.gl.UNSIGNED_BYTE, _canvas);
  window.gl.bindTexture(window.gl.TEXTURE_2D, null);
  imageOut.set(_framebuffer);
  objectsOut.set(predictions);
};

// imageIn.onChange = detectObjects;
