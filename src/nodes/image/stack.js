/**
 * @name Stack
 * @description Combine 2 images horizontally / vertically.
 * @category image
 */

const fragmentShader = `
precision mediump float;
uniform sampler2D u_input_texture_1;
uniform sampler2D u_input_texture_2;
uniform float u_direction;
varying vec2 v_uv;

void main() {
  vec2 uv = v_uv;
  if (u_direction == 0.0) {
    if (uv.x < 0.5) {
      gl_FragColor = texture2D(u_input_texture_1, vec2(uv.x * 2.0, uv.y));
    } else {
      gl_FragColor = texture2D(u_input_texture_2, vec2(uv.x * 2.0 - 1.0, uv.y));
    }
  } else {
    if (uv.y < 0.5) {
      gl_FragColor = texture2D(u_input_texture_1, vec2(uv.x, uv.y * 2.0));
    } else {
      gl_FragColor = texture2D(u_input_texture_2, vec2(uv.x, uv.y * 2.0 - 1.0));
    }
  }
}
`;

const imageIn1 = node.imageIn('image 1');
const imageIn2 = node.imageIn('image 2');
const directionIn = node.selectIn('Direction', ['Horizontal', 'Vertical']);
const imageOut = node.imageOut('out');

let program, framebuffer, m;

node.onStart = (props) => {
  program = figment.createShaderProgram(fragmentShader);
  framebuffer = new figment.Framebuffer();
};

node.onRender = () => {
  if (!imageIn1.value || !imageIn2.value) return;
  let u_direction;
  if (directionIn.value === 'Horizontal') {
    u_direction = 0.0;
    framebuffer.setSize(imageIn1.value.width + imageIn2.value.width, imageIn1.value.height);
  } else {
    u_direction = 1.0;
    framebuffer.setSize(imageIn1.value.width, imageIn1.value.height + imageIn2.value.height);
  }
  framebuffer.bind();
  figment.clear();
  figment.drawQuad(program, {
    u_input_texture_1: imageIn1.value.texture,
    u_input_texture_2: imageIn2.value.texture,
    u_direction,
  });
  framebuffer.unbind();
  imageOut.set(framebuffer);
};
