/**
 * @name Wrap
 * @description Circular wrap of input image.
 * @category image
 */

const fragmentShader = `
precision mediump float;
uniform sampler2D u_input_texture;
uniform float u_radius;
uniform float u_twist;
varying vec2 v_uv;

void main() {
  vec2 uv = v_uv;
 vec2 p = -1.0 + 2.0 * uv.st;
 float r = sqrt(dot(p,p));

p.x = mod(p.x + r * u_twist, 1.0);
 float a = atan(p.y,p.x);

uv.x = (a + 3.14159265359)/6.28318530718;
uv.y = r / sqrt(u_radius);
 vec3 col = texture2D(u_input_texture, uv).rgb;
 gl_FragColor = vec4(col, 1.0);

}
`;

const imageIn = node.imageIn('in');
const radiusIn = node.numberIn('radius', 2.0, { min: 0, max: 5, step: 0.01 });
const twistIn = node.numberIn('twist', 0.0, { min: -1, max: 1, step: 0.01 });
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
  figment.drawQuad(program, { u_input_texture: imageIn.value.texture, u_radius: radiusIn.value, u_twist: twistIn.value });
  framebuffer.unbind();
  imageOut.set(framebuffer);
};
