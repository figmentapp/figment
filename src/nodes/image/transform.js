/**
 * @name Transform
 * @description Translate/rotate/scale the image.
 * @category image
 */

const vertexShader = `
uniform mat4 u_transform;
attribute vec3 a_position;
attribute vec2 a_uv;
varying vec2 v_uv;
void main() {
  v_uv = a_uv;
  gl_Position = u_transform * vec4(a_position, 1.0);
}`;

const fragmentShader = `
precision mediump float;
uniform sampler2D u_input_texture;
varying vec2 v_uv;
void main() {
  gl_FragColor = texture2D(u_input_texture, v_uv.st);
}`;

const imageIn = node.imageIn('in');
const translateXIn = node.numberIn('translateX', 0, { min: -2, max: 2, step: 0.01 });
const translateYIn = node.numberIn('translateY', 0, { min: -2, max: 2, step: 0.01 });
const scaleXIn = node.numberIn('scaleX', 1, { min: -10, max: 10, step: 0.01 });
const scaleYIn = node.numberIn('scaleY', 1, { min: -10, max: 10, step: 0.01 });
const rotateIn = node.numberIn('rotate', 0.0, { min: -360, max: 360, step: 1 });
const imageOut = node.imageOut('out');

let program, framebuffer;

node.onStart = (props) => {
  program = figment.createShaderProgram(vertexShader, fragmentShader);
  framebuffer = new figment.Framebuffer();
};

node.onRender = () => {
  if (!imageIn.value) return;
  let transform = m4.identity();
  let factorX = 1.0 / imageIn.value.width;
  let factorY = 1.0 / imageIn.value.height;

  transform = m4.translate(transform, [factorX / 2, factorY / 2, 0]);
  transform = m4.translate(transform, [translateXIn.value, translateYIn.value, 0]);
  transform = m4.scale(transform, [scaleXIn.value, scaleYIn.value, 1]);
  transform = m4.rotateZ(transform, (rotateIn.value * Math.PI) / 180);
  transform = m4.translate(transform, [-factorX / 2, -factorY / 2, 0]);
  // console.log(transform);
  framebuffer.setSize(imageIn.value.width, imageIn.value.height);
  framebuffer.bind();
  figment.clear();
  figment.drawQuad(program, {
    u_transform: transform,
    u_input_texture: imageIn.value.texture,
  });
  framebuffer.unbind();
  imageOut.set(framebuffer);
};
