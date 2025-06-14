/**
 * @name Distortion
 * @description Simple distortion on image.
 * @category image
 */

const fragmentShader = `
precision mediump float;
uniform sampler2D u_input_texture;
uniform float u_distortion;
uniform float u_time;
varying vec2 v_uv;

void main() {
  vec2 uv = v_uv;
  float X = uv.x * 6. + u_time;
  float Y = uv.y * 6. + u_time;
  uv.x += cos(X + Y) * u_distortion * cos(Y);
  uv.y += sin(X + Y) * u_distortion * sin(Y);
  gl_FragColor = texture2D(u_input_texture, uv.st);
}
`;

const imageIn = node.imageIn('in');
const dist = node.numberIn('distortion', 0.2, { min: -1.0, max: 1.0, step: 0.01 });
const wave = node.numberIn('wave', 1.0, { min: 0.0, max: 10.0, step: 0.1 });
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
    u_distortion: dist.value,
    u_time: wave.value,
  });
  framebuffer.unbind();
  imageOut.set(framebuffer);
};
