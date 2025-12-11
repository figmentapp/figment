/**
 * @name Crop
 * @description Crop an input image
 * @category image
 */

// Shader for "cropped" mode (zooms into the texture)
const fragmentShaderCrop = `
precision mediump float;
uniform sampler2D u_input_texture;
uniform vec2 u_resolution;
uniform vec2 u_crop_size;
uniform vec2 u_anchor;
varying vec2 v_uv;

void main() {
  vec2 crop_ratio = u_crop_size / u_resolution;
  vec2 anchor_offset = u_anchor * (vec2(1.0) - crop_ratio);

  // Remap UVs to zoom into the crop area
  vec2 uv = v_uv * crop_ratio + anchor_offset;

  if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) {
    gl_FragColor = vec4(0.0, 0.0, 0.0, 0.0);
  } else {
    gl_FragColor = texture2D(u_input_texture, uv);
  }
}
`;

// Shader for "original" mode (masks out the area outside the crop)
const fragmentShaderOriginal = `
precision mediump float;
uniform sampler2D u_input_texture;
uniform vec2 u_resolution;
uniform vec2 u_crop_size;
uniform vec2 u_anchor;
varying vec2 v_uv;

void main() {
  vec2 crop_ratio = u_crop_size / u_resolution;
  vec2 anchor_offset = u_anchor * (vec2(1.0) - crop_ratio);

  // Calculate bounds of the crop area in 0..1 UV space
  vec2 min_bound = anchor_offset;
  vec2 max_bound = anchor_offset + crop_ratio;

  // Check if current pixel is outside the crop area
  if (v_uv.x < min_bound.x || v_uv.x > max_bound.x ||
      v_uv.y < min_bound.y || v_uv.y > max_bound.y) {
    gl_FragColor = vec4(0.0, 0.0, 0.0, 0.0); // Transparent
  } else {
    gl_FragColor = texture2D(u_input_texture, v_uv);
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
const modeIn = node.selectIn('output size', ['cropped', 'original'], 'cropped');
const imageOut = node.imageOut('out');

let programCrop, programOriginal, framebuffer;

node.onStart = (props) => {
  programCrop = figment.createShaderProgram(fragmentShaderCrop);
  programOriginal = figment.createShaderProgram(fragmentShaderOriginal);
  framebuffer = new figment.Framebuffer(widthIn.value, heightIn.value);
};

node.onRender = () => {
  if (!imageIn.value) return;

  const isOriginal = modeIn.value === 'original';

  // Determine output size based on mode
  const targetWidth = isOriginal ? imageIn.value.width : widthIn.value;
  const targetHeight = isOriginal ? imageIn.value.height : heightIn.value;

  framebuffer.setSize(targetWidth, targetHeight);
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

  // Select program based on mode
  const activeProgram = isOriginal ? programOriginal : programCrop;

  figment.drawQuad(activeProgram, {
    u_input_texture: imageIn.value.texture,
    u_resolution: [imageIn.value.width, imageIn.value.height],
    u_crop_size: [widthIn.value, heightIn.value],
    u_anchor: anchor,
  });

  framebuffer.unbind();
  imageOut.set(framebuffer);
};
