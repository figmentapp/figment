/**
 * @name SegmentPose2
 * @description Remove the background from an image.
 * @category ml
 */

const fragmentShader = `
precision mediump float;
uniform sampler2D u_input_texture;
uniform sampler2D u_segment_texture;
uniform int u_drawing_mode;
varying vec2 v_uv;

void main() {
  vec4 segment = texture2D(u_segment_texture, v_uv);
  if (segment.r >= 0.001) {
    if (u_drawing_mode == 0) { // Draw masked image
      gl_FragColor = vec4(1.0, 1.0, 1.0, 1.0);
    } else if (u_drawing_mode == 1) { // Draw mask
      gl_FragColor = texture2D(u_input_texture, v_uv);
    }
  } else {
    gl_FragColor = vec4(0.0, 0.0, 0.0, 0.0);
  }
}
`;

const imageIn = node.imageIn('in');
const drawingModeIn = node.selectIn('drawingMode', ['image', 'mask']);
const imageOut = node.imageOut('out');

let _model, _canvas, _ctx, _framebuffer, _program, _segmentTexture, _segmentBuffer;

node.onStart = async () => {
  _program = figment.createShaderProgram(fragmentShader);
  _canvas = document.createElement('canvas');
  _ctx = _canvas.getContext('2d');
  _framebuffer = new figment.Framebuffer(1, 1);
  _model = await figment.loadModel('body-pix', 'bodyPix');
  _segmentTexture = twgl.createTexture(window.gl, { width: 640, height: 480, format: gl.RED, type: gl.UNSIGNED_BYTE });
  _segmentBuffer = new Uint8Array(640 * 480);
};

async function segmentPersons() {
  if (!imageIn.value || imageIn.value.width === 0 || imageIn.value.height === 0) return;
  if (!_model) return;
  if (_canvas.width !== imageIn.value.width || _canvas.height !== imageIn.value.height) {
    _canvas.width = imageIn.value.width;
    _canvas.height = imageIn.value.height;
    _framebuffer.setSize(imageIn.value.width, imageIn.value.height);
  }

  const imageDataIn = figment.framebufferToImageData(imageIn.value);
  const segmentation = await _model.segmentMultiPerson(imageDataIn, {});
  // const imageDataOut = new ImageData(640, 480);

  _segmentBuffer.fill(0);
  for (const segment of segmentation) {
    const buffer = segment.data;
    for (let i = 0, l = buffer.length; i < l; i++) {
      if (buffer[i] === 0) continue;
      _segmentBuffer[i] = buffer[i];
    }
  }
  twgl.setTextureFromArray(window.gl, _segmentTexture, _segmentBuffer, { width: 640, height: 480, format: window.gl.LUMINANCE });
  _framebuffer.bind();
  figment.clear();
  figment.drawQuad(_program, {
    u_input_texture: imageIn.value.texture,
    u_segment_texture: _segmentTexture,
    u_drawing_mode: drawingModeIn.value === 'image' ? 0 : 1,
  });
  _framebuffer.unbind();

  imageOut.set(_framebuffer);
}

imageIn.onChange = segmentPersons;
