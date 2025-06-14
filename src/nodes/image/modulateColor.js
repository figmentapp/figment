/**
 * @name Modulate Color
 * @description Change the colors of the input image.
 * @category image
 */

const fragmentShader = `
precision mediump float;
uniform sampler2D u_input_texture;
uniform float u_red;
uniform float u_green;
uniform float u_blue;
varying vec2 v_uv;

void main() {
  vec2 uv = v_uv;
  vec4 col = texture2D(u_input_texture, uv.st);
  col.r = clamp(col.r + u_red, 0.0, 1.0);
  col.g = clamp(col.g + u_green, 0.0, 1.0);
  col.b = clamp(col.b + u_blue, 0.0, 1.0);
  gl_FragColor = col;
}
`;

const imageIn = node.imageIn('in');
const redIn = node.numberIn('red', 0, { min: -1, max: 1, step: 0.001 });
const greenIn = node.numberIn('green', 0, { min: -1, max: 1, step: 0.001 });
const blueIn = node.numberIn('blue', 0, { min: -1, max: 1, step: 0.001 });
const imageOut = node.imageOut('out');

let program, framebuffer;

node.onStart = () => {
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
    u_red: redIn.value,
    u_green: greenIn.value,
    u_blue: blueIn.value,
  });
  framebuffer.unbind();
  imageOut.set(framebuffer);
};
