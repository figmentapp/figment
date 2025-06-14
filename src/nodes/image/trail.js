/**
 * @name Trail
 * @description Don't erase the previous input image, creating a trail.
 * @category image
 */

const fragmentShader = `
precision mediump float;
uniform sampler2D u_input_texture;
varying vec2 v_uv;

void main() {
  vec4 color = texture2D(u_input_texture, v_uv);
  if (color.a <= 0.01) {
    discard;
  } else {
    gl_FragColor = color;
  }
}
`;

const imageIn = node.imageIn('in');
const clearButtonIn = node.triggerButtonIn('clear');
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
  figment.drawQuad(program, {
    u_input_texture: imageIn.value.texture,
  });
  framebuffer.unbind();
  imageOut.set(framebuffer);
};

function clear() {
  framebuffer.bind();
  figment.clear();
  framebuffer.unbind();
  imageOut.set(framebuffer);
}

clearButtonIn.onTrigger = clear;
