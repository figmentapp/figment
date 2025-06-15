/**
 * @name Segment Pose
 * @description Remove the background from an image.
 * @category ml
 */

const imageIn = node.imageIn('in');
const operationIn = node.selectIn('remove', ['background', 'foreground']);
const imageOut = node.imageOut('out');

let _framebuffer, _canvas, _results, _pose, _imageData, _isProcessing;

node.onStart = async (props) => {
  console.log('ml.segmentPose start');
  _framebuffer = new figment.Framebuffer();
  _canvas = new OffscreenCanvas(1, 1);
  _ctx = _canvas.getContext('2d');
  await figment.loadScripts(['./mediapipe/pose.js']);
  const pose = new Pose({
    locateFile: (file) => {
      return `./mediapipe/${file}`;
    },
  });
  pose.setOptions({
    modelComplexity: 1,
    smoothLandmarks: true,
    enableSegmentation: true,
  });
  await pose.initialize();
  _pose = pose;
};

function _detect(image) {
  // Check if only one image is processed at the same time.
  if (_isProcessing) return;
  return new Promise((resolve) => {
    _isProcessing = true;
    try {
      _pose.onResults((results) => {
        _pose.onResults(null);
        _isProcessing = false;
        resolve(results);
      });
      _pose.send({ image });
    } catch (err) {
      console.error('Error in pose detection:', err);
      _isProcessing = false;
      resolve(null);
    }
  });
}

node.onRender = async () => {
  if (!imageIn.value) return;
  if (!_pose) return;
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
};

function drawResults() {
  if (!imageIn.value || !_results) return;
  const width = imageIn.value.width;
  const height = imageIn.value.height;
  _ctx.save();
  _ctx.globalCompositeOperation = 'source-over';
  _ctx.clearRect(0, 0, _canvas.width, _canvas.height);
  if (_results.segmentationMask) {
    if (operationIn.value === 'background') {
      // Draw the segmentation mask.
      _ctx.drawImage(_results.segmentationMask, 0, 0);

      // Only overwrite existing pixels (i.e. the mask) with the image.
      _ctx.globalCompositeOperation = 'source-in';
      _ctx.drawImage(_results.image, 0, 0);
    } else {
      // Fill the destination.
      _ctx.fillRect(0, 0, _canvas.width, _canvas.height);

      // Draw everything outside of the segmentation mask.
      _ctx.globalCompositeOperation = 'destination-out';
      _ctx.drawImage(_results.segmentationMask, 0, 0);

      // Overwrite the existing pixels (i.e. the background) with the image.
      _ctx.globalCompositeOperation = 'source-in';
      _ctx.drawImage(_results.image, 0, 0);
    }
  }
  _ctx.restore();
  window.gl.bindTexture(gl.TEXTURE_2D, _framebuffer.texture);
  window.gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, _canvas);
  window.gl.bindTexture(gl.TEXTURE_2D, null);
  imageOut.set(_framebuffer);
}
