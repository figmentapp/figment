/**
 * @name Chroma Key
 * @description Make pixels of a certain color transparent, like green screen effect.
 * @category image
 */

const fragmentShader = `
precision mediump float;
uniform sampler2D u_input_texture;
uniform vec3 u_keyColor;
uniform float u_threshold;
varying vec2 v_uv;
void main() {

  vec2 uv = v_uv;
  vec4 color = texture2D(u_input_texture, uv.st);

  // calculate the color difference between the current pixel and the key color
  float difference = length(color.rgb - u_keyColor);

  // if the difference is less than the threshold, set the alpha to 0
  if (difference < u_threshold) {
    color.a = 0.0;
  }

  gl_FragColor = color;
}
`;

const imageIn = node.imageIn('in');
const colorIn = node.colorIn('key color', [0, 255, 0]);
const thresholdIn = node.numberIn('threshold', 0.4, { min: 0.0, max: 1.0, step: 0.01 });
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
    u_keyColor: [colorIn.value[0] / 255, colorIn.value[1] / 255, colorIn.value[2] / 255],
    u_threshold: thresholdIn.value,
  });
  framebuffer.unbind();
  imageOut.set(framebuffer);
};
