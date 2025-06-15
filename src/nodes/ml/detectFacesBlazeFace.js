/**
 * @name DetectFacesBlazeFace
 * @description Detect faces in an image (blazeface model)
 * @category ml
 */

const imageIn = node.imageIn('in');
const sizeIn = node.numberIn('size', 5);
const colorIn = node.colorIn('color', [0, 220, 20, 1.0]);
const toggleIn = node.toggleIn('with image', false);
const imageOut = node.imageOut('out');

let _model, _canvas, _ctx, _framebuffer;

node.onStart = async () => {
  _canvas = document.createElement('canvas');
  _ctx = _canvas.getContext('2d');
  _framebuffer = new figment.Framebuffer(1, 1);
  _model = await figment.loadModel('blazeface', 'blazeface');
};

function detectFaces() {
  if (!imageIn.value || imageIn.value.width === 0 || imageIn.value.height === 0) return;
  if (!_model) return;
  if (_canvas.width !== imageIn.value.width || _canvas.height !== imageIn.value.height) {
    _canvas.width = imageIn.value.width;
    _canvas.height = imageIn.value.height;
    _framebuffer.setSize(imageIn.value.width, imageIn.value.height);
  }
  const imageData = figment.framebufferToImageData(imageIn.value);
  const returnTensors = true;
  const s = sizeIn.value;
  _model.estimateFaces(imageData, returnTensors).then((predictions) => {
    _ctx.clearRect(0, 0, imageIn.value.width, imageIn.value.height);
    if (toggleIn.value) {
      _ctx.putImageData(imageData, 0, 0);
    }
    if (predictions.length > 0) {
      for (let i = 0; i < predictions.length; i++) {
        if (returnTensors) {
          predictions[i].topLeft = predictions[i].topLeft.arraySync();
          predictions[i].bottomRight = predictions[i].bottomRight.arraySync();
          predictions[i].landmarks = predictions[i].landmarks.arraySync();
        }
        const start = predictions[i].topLeft;
        const end = predictions[i].bottomRight;
        const size = [end[0] - start[0], end[1] - start[1]];

        // Render a rectangle over each detected face.
        _ctx.fillStyle = 'rgba(255,130,0,.3)';
        _ctx.fillRect(start[0], start[1], size[0], size[1]);
        // Render a rectangle on all landmarks
        for (let mark of predictions[i].landmarks) {
          _ctx.strokeStyle = figment.toCanvasColor(colorIn.value);
          _ctx.strokeRect(mark[0] - s, mark[1] - s, s * 2, s * 2);
        }
      }
    }

    window.gl.bindTexture(window.gl.TEXTURE_2D, _framebuffer.texture);
    window.gl.texImage2D(window.gl.TEXTURE_2D, 0, window.gl.RGBA, window.gl.RGBA, window.gl.UNSIGNED_BYTE, _canvas);
    window.gl.bindTexture(window.gl.TEXTURE_2D, null);
    imageOut.set(_framebuffer);
  });
}

imageIn.onChange = detectFaces;
colorIn.onChange = detectFaces;
toggleIn.onChange = detectFaces;
sizeIn.onChange = detectFaces;
