/**
 * @name Reduce Color
 * @description Reduce the amount of colors of input image.
 * @category image
 */

const fragmentShader = `
precision mediump float;
uniform sampler2D u_input_texture;
varying vec2 v_uv;
uniform float u_factor;

void main() {
  vec2 uv = v_uv;
  vec4 color = texture2D(u_input_texture, uv.st);
  vec3 col = color.rgb;
  col = floor(col * u_factor) / u_factor;
  gl_FragColor = vec4(col,1.0);
}
`;

const imageIn = node.imageIn('in');
const factorIn = node.numberIn('reduce colors', 2.0, { min: 0.0, max: 100.0, step: 0.1 });
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
  figment.drawQuad(program, { u_input_texture: imageIn.value.texture, u_factor: factorIn.value });
  framebuffer.unbind();
  imageOut.set(framebuffer);
};
