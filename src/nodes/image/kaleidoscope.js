/**
 * @name Kaleidoscope
 * @description Radial reflection around center point of image.
 * @category image
 */

const fragmentShader = `
precision mediump float;
uniform sampler2D u_input_texture;
uniform float u_sides;
uniform float u_angle;
varying vec2 v_uv;

void main() {
  vec2 uv = v_uv;

  vec2 p = v_uv - 0.5;
  float r = length(p);
  float a = atan(p.y, p.x) + u_angle;
  float tau = 2. * 3.1416 ;
  a = mod(a, tau/u_sides);
  a = abs(a - tau/u_sides/2.) ;
  p = r * vec2(cos(a), sin(a));
  vec4 color = texture2D(u_input_texture, p + 0.5);
  gl_FragColor = color;
}
`;

const imageIn = node.imageIn('in');
const angleIn = node.numberIn('angle', 0.0, { min: 0.0, max: 6.3, step: 0.01 });
const sidesIn = node.numberIn('sides', 6.0, { min: 0.0, max: 35.0, step: 1.0 });
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
  figment.drawQuad(program, { u_input_texture: imageIn.value.texture, u_sides: sidesIn.value, u_angle: angleIn.value });
  framebuffer.unbind();
  imageOut.set(framebuffer);
};
