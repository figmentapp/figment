/**
 * @name Cartoon
 * @description Render cartoon like image.
 * @category image
 */

// demo: https://www.shadertoy.com/view/MslfWj // Ruofei Du

const fragmentShader = `
precision mediump float;
uniform sampler2D u_input_texture;
uniform float u_num;
varying vec2 v_uv;

const mat3 rgb2yuv_mat = mat3(
  0.2126,    0.7152,   0.0722,
 -0.09991,  -0.33609,  0.436,
  0.615,    -0.55861, -0.05639
);

const mat3 yuv2rgb_mat = mat3(
  1.0,  0.0,      1.28033,
  1.0, -0.21482, -0.38059,
  1.0,  2.12798,  0.0
);

vec3 rgb2yuv(vec3 rgb) {
  return rgb * rgb2yuv_mat;
}

vec3 yuv2rgb(vec3 rgb) {
  return rgb * yuv2rgb_mat;
}

void main() {
  vec2 uv = v_uv;
  vec4 color = texture2D(u_input_texture, uv.st);
  vec3 yuv = rgb2yuv(color.rgb);
  vec3 rgb = yuv2rgb(vec3(floor(yuv.x * u_num) / u_num, yuv.yz));
  color = vec4(rgb, 1.0);
  gl_FragColor = color;
}
`;

const imageIn = node.imageIn('in');
const num = node.numberIn('amount', 3.0, { min: 2.0, max: 8.0, step: 0.1 });
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
  figment.drawQuad(program, { u_input_texture: imageIn.value.texture, u_num: num.value });
  framebuffer.unbind();
  imageOut.set(framebuffer);
};
