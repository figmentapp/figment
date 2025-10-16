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

let _framebuffer, _maskFramebuffer, _maskTexture, _imageData;
let _program;
let _mpClient = null;

node.onStart = async () => {
  _program = figment.createShaderProgram(fragmentShader);
  _framebuffer = new figment.Framebuffer();
  _maskFramebuffer = new figment.Framebuffer();
  _maskTexture = new figment.Framebuffer();
  _mpClient = new figment.MediaPipeWorkerClient('segmentPose', {
    basePath: new URL('./mediapipe', window.location.href).href,
    modelAssetPath: new URL(`./mediapipe/pose_landmarker_${modelIn.value}.task`, window.location.href).href,
    taskOptions: { runningMode: 'IMAGE', numPoses: numPosesIn.value, outputSegmentationMasks: true },
  });
};

node.onRender = async () => {
  if (!imageIn.value) return;
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
  const bitmap = await createImageBitmap(_imageData);
  try {
    const res = await _mpClient.inferBitmap(bitmap, width, height);
    drawWorkerResult(res);
  } catch (err) {
    const message = err && err.message ? err.message : String(err);
    if (message === 'reinit' || message === 'terminated') return;
    throw err instanceof Error ? err : new Error(message);
  }
};

// Removed legacy sync path; worker result is handled in drawWorkerResult.

function drawWorkerResult(result) {
  if (!imageIn.value || !result) {
    imageOut.value = imageIn.value;
    detectedOut.value = false;
    landmarksOut.value = null;
    maskOut.value = null;
    return;
  }

  const width = imageIn.value.width;
  const height = imageIn.value.height;

  if (result.landmarks && result.landmarks.length > 0) {
    detectedOut.value = true;
    landmarksOut.value = result.landmarks;

    if (result.mask) {
      const maskData = new Uint8Array(result.mask);
      const rgbaData = new Uint8ClampedArray(width * height * 4);
      for (let i = 0; i < maskData.length; i++) {
        const p = i * 4;
        const v = maskData[i];
        rgbaData[p] = v;
        rgbaData[p + 1] = v;
        rgbaData[p + 2] = v;
        rgbaData[p + 3] = 255;
      }

      _maskTexture.setSize(width, height);
      window.gl.bindTexture(gl.TEXTURE_2D, _maskTexture.texture);
      window.gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, rgbaData);
      window.gl.bindTexture(gl.TEXTURE_2D, null);

      _maskFramebuffer.setSize(width, height);
      _maskFramebuffer.bind();
      figment.clear();
      window.gl.bindTexture(gl.TEXTURE_2D, _maskFramebuffer.texture);
      window.gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, rgbaData);
      window.gl.bindTexture(gl.TEXTURE_2D, null);
      _maskFramebuffer.unbind();
      maskOut.value = _maskFramebuffer;

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

function updateOptions() {
  if (_mpClient) {
    _mpClient.setOptions({ numPoses: numPosesIn.value });
  }
}

numPosesIn.onChange = updateOptions;
modelIn.onChange = async () => {
  if (_mpClient) {
    await _mpClient.reinit({
      basePath: new URL('./mediapipe', window.location.href).href,
      modelAssetPath: new URL(`./mediapipe/pose_landmarker_${modelIn.value}.task`, window.location.href).href,
      taskOptions: { runningMode: 'IMAGE', numPoses: numPosesIn.value, outputSegmentationMasks: true },
    });
  }
};

node.onStop = () => {
  if (_mpClient) _mpClient.terminate();
  _mpClient = null;
};
