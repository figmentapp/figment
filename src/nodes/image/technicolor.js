/**
 * @name Technicolor
 * @description Simulates the look of the two-strip technicolor process popular in early 20th century films.
 * @category image
 */

const fragmentShader = `
// http://www.widescreenmuseum.com/oldcolor/technicolor1.htm
precision mediump float;
uniform sampler2D u_input_texture;
varying vec2 v_uv;

void main() {
  vec2 uv = v_uv;
  vec4 tex = texture2D( u_input_texture, vec2( uv.x, uv.y ) );
  vec4 newTex = vec4(tex.r, (tex.g + tex.b) * .5, (tex.g + tex.b) * .5, 1.0);
  gl_FragColor = newTex;
}
`;

const imageIn = node.imageIn('in');
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
  figment.drawQuad(program, { u_input_texture: imageIn.value.texture });
  framebuffer.unbind();
  imageOut.set(framebuffer);
};
