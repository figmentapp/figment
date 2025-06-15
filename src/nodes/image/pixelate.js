/**
 * @name Pixelate
 * @description Pixelate input image (Mosaic effect).
 * @category image
 */

const fragmentShader = `
precision mediump float;
uniform sampler2D u_input_texture;
uniform float u_cell_size;
uniform vec2 u_resolution;
varying vec2 v_uv;

void main() {
  vec2 cells = u_resolution / u_cell_size;
  vec2 cell_uv = floor(v_uv * cells) / cells;
  vec3 color = texture2D(u_input_texture, cell_uv).rgb;
  gl_FragColor = vec4(color, 1.0);
}
`;

const imageIn = node.imageIn('in');
const cellSize = node.numberIn('cell size', 32, { min: 1, max: 200, step: 1 });
const imageOut = node.imageOut('out');

let program, framebuffer;

node.onStart = (props) => {
  program = figment.createShaderProgram(fragmentShader);
  framebuffer = new figment.Framebuffer();
};

node.onRender = () => {
  if (!imageIn.value) return;

  framebuffer.setSize(imageIn.value.width, imageIn.value.height);
  framebuffer.bind();
  figment.clear();

  figment.drawQuad(program, {
    u_input_texture: imageIn.value.texture,
    u_cell_size: cellSize.value,
    u_resolution: [imageIn.value.width, imageIn.value.height],
  });

  framebuffer.unbind();
  imageOut.set(framebuffer);
};
