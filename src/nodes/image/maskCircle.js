/**
 * @name Mask Ellipse
 * @description Draw a circular mask of an image or color.
 * @category image
 */

const fragmentShader = `
precision mediump float;
uniform sampler2D u_input_texture;
uniform float u_radius;
uniform bool u_invert;
varying vec2 v_uv;

float draw_circle(vec2 coord, float radius) {
  return step(length(coord), radius);
}

void main() {
  vec2 uv = v_uv;
  vec4 color = texture2D(u_input_texture, uv.xy);
  vec2 offset = vec2(0.5, 0.5);
  float circle = draw_circle(uv - offset, u_radius);
  u_invert ? circle = 1.0 - circle : circle = circle;
  vec3 colort = vec3(circle);
  gl_FragColor = vec4(colort, 1.0)*color;
}
`;

const imageIn = node.imageIn('in');
const radiusIn = node.numberIn('radius', 0.4, { min: 0.0, max: 0.5, step: 0.01 });
const invertIn = node.toggleIn('invert', true);
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
  figment.drawQuad(program, { u_input_texture: imageIn.value.texture, u_radius: radiusIn.value, u_invert: invertIn.value });
  framebuffer.unbind();
  imageOut.set(framebuffer);
};
