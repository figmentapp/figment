/**
 * @name Crop
 * @description Crop an input image
 * @category image
 */

const fragmentShader = `
precision mediump float;
uniform sampler2D u_input_texture;
uniform vec2 u_resolution;
uniform vec2 u_crop_size;
uniform vec2 u_anchor;
varying vec2 v_uv;

void main() {
  vec2 crop_ratio = u_crop_size / u_resolution;
  vec2 anchor_offset = u_anchor * (vec2(1.0) - crop_ratio);

  vec2 uv = v_uv * crop_ratio + anchor_offset;

  if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) {
    gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0);
  } else {
    gl_FragColor = texture2D(u_input_texture, uv);
  }
}
`;

const imageIn = node.imageIn('in');
const widthIn = node.numberIn('width', 512.0, { min: 1, max: 4096, step: 1 });
const heightIn = node.numberIn('height', 512.0, { min: 1, max: 4096, step: 1 });

const anchorIn = node.selectIn(
  'anchor',
  ['top-left', 'top-center', 'top-right', 'center-left', 'center', 'center-right', 'bottom-left', 'bottom-center', 'bottom-right'],
  'center',
);

const imageOut = node.imageOut('out');

let program, framebuffer;

node.onStart = (props) => {
  program = figment.createShaderProgram(fragmentShader);
  framebuffer = new figment.Framebuffer(widthIn.value, heightIn.value);
};

node.onRender = () => {
  if (!imageIn.value) return;

  framebuffer.setSize(widthIn.value, heightIn.value);
  framebuffer.bind();
  figment.clear();

  const anchorMap = {
    'top-left': [0, 0],
    'top-center': [0.5, 0],
    'top-right': [1, 0],
    'center-left': [0, 0.5],
    center: [0.5, 0.5],
    'center-right': [1, 0.5],
    'bottom-left': [0, 1],
    'bottom-center': [0.5, 1],
    'bottom-right': [1, 1],
  };

  const anchor = anchorMap[anchorIn.value];

  figment.drawQuad(program, {
    u_input_texture: imageIn.value.texture,
    u_resolution: [imageIn.value.width, imageIn.value.height],
    u_crop_size: [widthIn.value, heightIn.value],
    u_anchor: anchor,
  });

  framebuffer.unbind();
  imageOut.set(framebuffer);
};
