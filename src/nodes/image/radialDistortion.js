/**
 * @name Radial Distortion
 * @description Radial distortion on image.
 * @category image
 */

const fragmentShader = `
precision mediump float;
uniform sampler2D u_input_texture;
uniform float u_distortion;
uniform float u_time;
varying vec2 v_uv;

void main() {
  vec2 uv = v_uv - 0.5; // translate coordinates to center
  float radius = length(uv); // get polar radius
  float angle = atan(uv.y, uv.x); // get polar angle
  radius += cos(angle * 4.0 + u_time) * u_distortion; // apply radial distortion
  uv = radius * vec2(cos(angle), sin(angle)); // convert back to cartesian coordinates
  uv += 0.5; // translate coordinates back to corner
  gl_FragColor = texture2D(u_input_texture, uv.st);
}
`;

const imageIn = node.imageIn('in');
const dist = node.numberIn('distortion', 0.2, { min: -1.0, max: 1.0, step: 0.01 });
const rotate = node.numberIn('rotate', 1.0, { min: 0.0, max: 25.0, step: 0.1 });
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
    u_time: rotate.value,
  });
  framebuffer.unbind();
  imageOut.set(framebuffer);
};
