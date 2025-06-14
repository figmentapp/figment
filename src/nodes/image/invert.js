/**
 * @name Invert
 * @description Invert the colors of input image.
 * @category image
 */

const fragmentShader = `
precision mediump float;
uniform sampler2D u_input_texture;
varying vec2 v_uv;
void main() {
  gl_FragColor = texture2D(u_input_texture, v_uv);
  gl_FragColor.rgb = 1.0 - gl_FragColor.rgb;
}
`;

const imageIn = node.imageIn('in');
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
  figment.drawQuad(program, { u_input_texture: imageIn.value.texture });
  framebuffer.unbind();
  imageOut.set(framebuffer);
};
