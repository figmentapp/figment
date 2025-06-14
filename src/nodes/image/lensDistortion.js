/**
 * @name Lens Distortion
 * @description Distort an image using a lens distortion shader.
 * @category image
 */

const fragmentShader = `
precision mediump float;
uniform sampler2D u_input_texture;
uniform float u_k1;
uniform float u_k2;
uniform vec2 u_offset;
varying vec2 v_uv;

void main() {
  vec2 uv = v_uv;
  vec2 t = uv - 0.5;
  float r2 = t.x * t.x + t.y * t.y;
  float f = 0.0;

  if (u_k2 == 0.0) {
    f = 1.0 + r2 * u_k1;
  } else {
    f = 1.0 + r2 * (u_k1 + u_k2 * sqrt(r2));
  }
  vec2 distorted_uv = f * t + 0.5 + u_offset;
  if (distorted_uv.x < 0.0 || distorted_uv.x > 1.0 || distorted_uv.y < 0.0 || distorted_uv.y > 1.0) {
    gl_FragColor = vec4(0.0, 0.0, 0.0, 0.0);
    return;
  }

  vec3 col = texture2D(u_input_texture, distorted_uv).rgb;
  gl_FragColor = vec4(col, 1.0);
}
`;

const imageIn = node.imageIn('in');
const k1In = node.numberIn('k1', 0.0, { min: -10, max: 10, step: 0.01 });
const k2In = node.numberIn('k2', 0.0, { min: -10, max: 10, step: 0.01 });
const offsetXIn = node.numberIn('offsetX', 0.0, { min: -1, max: 1, step: 0.01 });
const offsetYIn = node.numberIn('offsetY', 0.0, { min: -1, max: 1, step: 0.01 });
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
    u_k1: k1In.value,
    u_k2: k2In.value,
    u_offset: [offsetXIn.value, offsetYIn.value],
  });
  framebuffer.unbind();
  imageOut.set(framebuffer);
};
