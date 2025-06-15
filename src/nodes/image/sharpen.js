/**
 * @name Sharpen
 * @description Sharpen an input image.
 * @category image
 */

const fragmentShader = `
precision mediump float;
uniform sampler2D u_input_texture;
varying vec2 v_uv;
uniform float u_step;
//#define STEP .005

#define BOT 1.-u_step
#define TOP 1.+u_step
#define CEN 1

void main() {
  vec2 uv = v_uv;

  gl_FragColor = texture2D( u_input_texture, uv) *2.
  -texture2D(u_input_texture, uv*vec2(BOT, BOT))/8.
  -texture2D(u_input_texture, uv*vec2(CEN, BOT))/8.
  -texture2D(u_input_texture, uv*vec2(TOP, BOT))/8.
  -texture2D(u_input_texture, uv*vec2(BOT, CEN))/8.
  -texture2D(u_input_texture, uv*vec2(TOP, CEN))/8.
  -texture2D(u_input_texture, uv*vec2(BOT, TOP))/8.
  -texture2D(u_input_texture, uv*vec2(CEN, TOP))/8.
  -texture2D(u_input_texture, uv*vec2(TOP, TOP))/8.;

}
`;

const imageIn = node.imageIn('in');
const sharpenIn = node.numberIn('amount', 0.005, { min: 0, max: 0.1, step: 0.001 });
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
  figment.drawQuad(program, { u_input_texture: imageIn.value.texture, u_step: sharpenIn.value });
  framebuffer.unbind();
  imageOut.set(framebuffer);
};
