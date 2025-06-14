/**
 * @name Blur
 * @description Blur an input image
 * @category image
 */

const fragmentShader = `
precision mediump float;

uniform sampler2D u_input_texture;
varying vec2 v_uv;
uniform float u_step;

#define BOT 1.0 - u_step
#define TOP 1.0 + u_step
#define CEN 1.0

void main() {
  vec2 uv = v_uv;

  gl_FragColor =
    texture2D(u_input_texture, uv + vec2(-u_step, -u_step)) / 8.0 +
    texture2D(u_input_texture, uv + vec2(-u_step, 0.0)) / 8.0 +
    texture2D(u_input_texture, uv + vec2(-u_step, u_step)) / 8.0 +
    texture2D(u_input_texture, uv + vec2(0.0, -u_step)) / 8.0 +
    texture2D(u_input_texture, uv + vec2(0.0, 0.0)) / 8.0 +
    texture2D(u_input_texture, uv + vec2(0.0, u_step)) / 8.0 +
    texture2D(u_input_texture, uv + vec2(u_step, -u_step)) / 8.0 +
    texture2D(u_input_texture, uv + vec2(u_step, 0.0)) / 8.0 +
    texture2D(u_input_texture, uv + vec2(u_step, u_step)) / 8.0;
}
`;

const imageIn = node.imageIn('in');
const blurIn = node.numberIn('amount', 0.005, { min: 0, max: 0.02, step: 0.001 });
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
  figment.drawQuad(program, { u_input_texture: imageIn.value.texture, u_step: blurIn.value });
  framebuffer.unbind();
  imageOut.set(framebuffer);
};
