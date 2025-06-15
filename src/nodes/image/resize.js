/**
 * @name Resize
 * @description Resize the input image
 * @category image
 */

const fragmentShader = `
precision mediump float;
uniform sampler2D u_input_texture;
uniform vec4 u_background_color;
uniform vec2 u_scale;
varying vec2 v_uv;

void main() {
  vec2 uv = u_scale * (v_uv - 0.5) + 0.5;
  if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) {
    gl_FragColor = u_background_color;
  } else {
    gl_FragColor = texture2D(u_input_texture, uv);
  }
}
`;

const imageIn = node.imageIn('in');
const widthIn = node.numberIn('width', 512, { min: 0 });
const heightIn = node.numberIn('height', 512, { min: 0 });
const fitIn = node.selectIn('fit', ['fill', 'contain', 'cover'], 'cover');
const backgroundIn = node.colorIn('background', [0, 0, 0, 1]);
const imageOut = node.imageOut('out');

let program, framebuffer;

node.onStart = (props) => {
  program = figment.createShaderProgram(fragmentShader);
  framebuffer = new figment.Framebuffer();
};

const LANDSCAPE = 1;
const PORTRAIT = 2;

node.onRender = () => {
  if (!imageIn.value) return;
  let inRatio = imageIn.value.width / imageIn.value.height;
  let outRatio = widthIn.value / heightIn.value;
  let aspect;
  let orientation;
  if (inRatio > outRatio) {
    orientation = LANDSCAPE;
    aspect = inRatio / outRatio;
  } else {
    orientation = PORTRAIT;
    aspect = outRatio / inRatio;
  }
  let scale;
  if (fitIn.value == 'fill') {
    // We will stretch the image, so just use the input scale.
    scale = [1, 1];
  } else if (fitIn.value == 'contain') {
    // Either width or height will be smaller, so we need to scale the other one.
    if (orientation === LANDSCAPE) {
      scale = [1, aspect];
    } else {
      scale = [aspect, 1];
    }
  } else if (fitIn.value == 'cover') {
    // Either width or height will extend outside of the frame.
    if (orientation === LANDSCAPE) {
      scale = [1 / aspect, 1];
    } else {
      scale = [1, 1 / aspect];
    }
  }

  const color = backgroundIn.value;
  framebuffer.setSize(widthIn.value, heightIn.value);
  framebuffer.bind();
  figment.clear();
  figment.drawQuad(program, {
    u_input_texture: imageIn.value.texture,
    u_scale: scale,
    u_background_color: [color[0] / 255, color[1] / 255, color[2] / 255, color[3]],
  });
  framebuffer.unbind();
  imageOut.set(framebuffer);
};
