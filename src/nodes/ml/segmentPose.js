/**
 * @name Segment Pose
 * @description Remove the background from an image using MediaPipe pose segmentation.
 * @category ml
 */

const fragmentShader = `
precision mediump float;
uniform sampler2D u_source_texture;
uniform sampler2D u_mask_texture;
uniform int u_operation;
varying vec2 v_uv;

void main() {
  vec4 input_color = texture2D(u_source_texture, v_uv);
  vec4 mask_color = texture2D(u_mask_texture, v_uv);
  float mask_value = mask_color.r; // Use red channel as mask

  if (u_operation == 0) {
    // Remove background: keep foreground where mask is white
    gl_FragColor = vec4(input_color.rgb, input_color.a * mask_value);
  } else {
    // Remove foreground: keep background where mask is black
    gl_FragColor = vec4(input_color.rgb, input_color.a * (1.0 - mask_value));
  }
}
`;

const imageIn = node.imageIn('in');
const operationIn = node.selectIn('remove', ['background', 'foreground']);
const numPosesIn = node.numberIn('number of poses', 1, { min: 1, max: 4, step: 1 });
const modelIn = node.selectIn('model', ['lite', 'full', 'heavy'], 'lite');

const imageOut = node.imageOut('out');
const detectedOut = node.booleanOut('detected');
const landmarksOut = node.objectOut('landmarks');
const maskOut = node.imageOut('mask');

let _vision, _poseLandmarker;
let _framebuffer, _maskFramebuffer, _maskTexture, _imageData;
let _program;
let _initialising = false;

async function initLandmarker() {
  if (_initialising) return;
  _initialising = true;
  if (_poseLandmarker) {
    await _poseLandmarker.close();
  }

  _poseLandmarker = await mediapipe.PoseLandmarker.createFromOptions(_vision, {
    baseOptions: {
      modelAssetPath: `./mediapipe/pose_landmarker_${modelIn.value}.task`,
      delegate: 'GPU',
    },
    runningMode: 'IMAGE',
    numPoses: numPosesIn.value,
    outputSegmentationMasks: true,
  });
  _initialising = false;
}

node.onStart = async () => {
  _program = figment.createShaderProgram(fragmentShader);
  _framebuffer = new figment.Framebuffer();
  _maskFramebuffer = new figment.Framebuffer();
  _maskTexture = new figment.Framebuffer();
  _vision = await mediapipe.FilesetResolver.forVisionTasks('./mediapipe');
  await initLandmarker();
};

node.onRender = () => {
  if (!imageIn.value || _initialising) return;
  const width = imageIn.value.width;
  const height = imageIn.value.height;

  if (!_imageData || width !== _imageData.width || height !== _imageData.height) {
    _imageData = new ImageData(width, height);
    _framebuffer.setSize(width, height);
    _maskFramebuffer.setSize(width, height);
  }

  imageIn.value.bind();
  window.gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, _imageData.data);
  imageIn.value.unbind();

  const pose = _poseLandmarker.detect(_imageData);
  drawResults(pose);
};

function drawResults(pose) {
  if (!imageIn.value || !pose) {
    // No pose detected, pass through original image
    imageOut.value = imageIn.value;
    detectedOut.value = false;
    landmarksOut.value = null;
    maskOut.value = null;
    return;
  }

  const width = imageIn.value.width;
  const height = imageIn.value.height;

  if (pose.landmarks && pose.landmarks.length > 0) {
    detectedOut.value = true;
    landmarksOut.value = pose.landmarks;

    if (pose.segmentationMasks && pose.segmentationMasks.length > 0) {
      const segmentationMask = pose.segmentationMasks[0];
      const maskData = segmentationMask.getAsUint8Array();

      // Create RGBA data for mask texture
      const rgbaData = new Uint8ClampedArray(width * height * 4);
      for (let i = 0; i < maskData.length; i++) {
        const pixelIndex = i * 4;
        const maskValue = maskData[i];
        rgbaData[pixelIndex] = maskValue; // R
        rgbaData[pixelIndex + 1] = maskValue; // G
        rgbaData[pixelIndex + 2] = maskValue; // B
        rgbaData[pixelIndex + 3] = 255; // A
      }

      // Update mask texture using framebuffer
      _maskTexture.setSize(width, height);
      window.gl.bindTexture(gl.TEXTURE_2D, _maskTexture.texture);
      window.gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, rgbaData);
      window.gl.bindTexture(gl.TEXTURE_2D, null);

      // Create mask framebuffer for mask output
      _maskFramebuffer.setSize(width, height);
      _maskFramebuffer.bind();
      figment.clear();
      window.gl.bindTexture(gl.TEXTURE_2D, _maskFramebuffer.texture);
      window.gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, rgbaData);
      window.gl.bindTexture(gl.TEXTURE_2D, null);
      _maskFramebuffer.unbind();
      maskOut.value = _maskFramebuffer;

      // Apply segmentation using shader
      _framebuffer.setSize(width, height);
      _framebuffer.bind();
      figment.clear();
      figment.drawQuad(_program, {
        u_source_texture: imageIn.value.texture,
        u_mask_texture: _maskTexture.texture,
        u_operation: operationIn.value === 'background' ? 0 : 1,
        u_resolution: [width, height],
      });
      _framebuffer.unbind();
      imageOut.value = _framebuffer;
    } else {
      // No segmentation mask, pass through original image
      imageOut.value = imageIn.value;
      maskOut.value = null;
    }
  } else {
    detectedOut.value = false;
    landmarksOut.value = null;
    maskOut.value = null;
    imageOut.value = imageIn.value;
  }
}

numPosesIn.onChange = initLandmarker;
modelIn.onChange = initLandmarker;
