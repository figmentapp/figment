/**
 * @name Glow Edges
 * @description Computes glowing edges on input image.
 * @category image
 */

const fragmentShader = `
precision mediump float;
uniform sampler2D u_input_texture;
uniform vec2 u_resolution;
uniform vec4 u_color;
uniform float u_stroke;
varying vec2 v_uv;

void make_kernel(inout vec4 n[9], sampler2D tex, vec2 coord)
{
  float w = u_stroke / u_resolution.x;
  float h = u_stroke / u_resolution.y;

  n[0] = texture2D(tex, coord + vec2( -w, -h));
  n[1] = texture2D(tex, coord + vec2(0.0, -h));
  n[2] = texture2D(tex, coord + vec2(  w, -h));
  n[3] = texture2D(tex, coord + vec2( -w, 0.0));
  n[4] = texture2D(tex, coord);
  n[5] = texture2D(tex, coord + vec2(  w, 0.0));
  n[6] = texture2D(tex, coord + vec2( -w, h));
  n[7] = texture2D(tex, coord + vec2(0.0, h));
  n[8] = texture2D(tex, coord + vec2(  w, h));
}

void main() {
  vec2 uv = v_uv;
  vec2 p = uv;
  vec4 n[9];
  make_kernel(n, u_input_texture, uv.st);

  vec4 sobel_edge_h = n[2] + (2.0*n[5]) + n[8] - (n[0] + (2.0*n[3]) + n[6]);
  vec4 sobel_edge_v = n[0] + (2.0*n[1]) + n[2] - (n[6] + (2.0*n[7]) + n[8]);
  vec4 sobel = sqrt((sobel_edge_h * sobel_edge_h) + (sobel_edge_v * sobel_edge_v));

  float r = (sobel_edge_h.r*sobel_edge_h.r + sobel_edge_v.r*sobel_edge_v.r)*u_color.r;
  float g = (sobel_edge_h.g*sobel_edge_h.g + sobel_edge_v.g*sobel_edge_v.g)*u_color.g;
  float b = (sobel_edge_h.b*sobel_edge_h.b + sobel_edge_v.b*sobel_edge_v.b)*u_color.b;

  vec4 col = texture2D(u_input_texture, uv);
  col += vec4(r, g, b,1.0);
  gl_FragColor = col;
}
`;

const imageIn = node.imageIn('in');
const colorIn = node.colorIn('edge color', [0, 255, 0, 1.0]);
const strokeIn = node.numberIn('stroke width', 1.0, { min: 0.0, max: 5.0, step: 0.1 });
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
    u_resolution: [imageIn.value.width, imageIn.value.height],
    u_color: [colorIn.value[0] / 255, colorIn.value[1] / 255, colorIn.value[2] / 255, colorIn.value[3]],
    u_stroke: strokeIn.value,
  });
  framebuffer.unbind();
  imageOut.set(framebuffer);
};
