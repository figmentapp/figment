/**
 * @name Border
 * @description Generate a border around the image.
 * @category image
 */

const fragmentShader = `
precision mediump float;
uniform sampler2D u_input_texture;
uniform vec2 u_resolution;
uniform vec4 u_border_color;
uniform float u_border_size;
varying vec2 v_uv;

void main() {
  float image_ratio = u_resolution.x / u_resolution.y;
  float border_frac = u_border_size / u_resolution.x;
  if (v_uv.x < border_frac || v_uv.x > 1.0 - border_frac || v_uv.y < border_frac || v_uv.y > 1.0 - border_frac) {
    gl_FragColor = u_border_color;
  } else {
    gl_FragColor = texture2D(u_input_texture, v_uv);
  }
}
`;

const imageIn = node.imageIn('in');
const borderSize = node.numberIn('borderSize', 10.0, { min: 1, max: 512, step: 1 });
const borderColor = node.colorIn('borderColor', [255, 255, 255, 1.0]);
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
  figment.drawQuad(program, {
    u_input_texture: imageIn.value.texture,
    u_resolution: [imageIn.value.width, imageIn.value.height],
    u_border_size: borderSize.value,
    u_border_color: [borderColor.value[0] / 255, borderColor.value[1] / 255, borderColor.value[2] / 255, borderColor.value[3]],
  });
  framebuffer.unbind();
  imageOut.set(framebuffer);
};
