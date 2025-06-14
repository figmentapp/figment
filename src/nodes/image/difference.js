/**
 * @name Difference
 * @description Calculate the difference between this image and the previous one.
 * @category image
 */

const fragmentShader = `
precision mediump float;
uniform sampler2D u_current_texture;
uniform sampler2D u_previous_texture;
uniform float u_amplify;
varying vec2 v_uv;
void main() {
  vec3 currentColor = texture2D(u_current_texture, v_uv).rgb;
  vec3 previousColor = texture2D(u_previous_texture, v_uv).rgb;

  // Calculate absolute difference between current and previous color
  vec3 diff = abs(previousColor - currentColor) * u_amplify;

  gl_FragColor = vec4(diff, 1.0);
}
`;

const imageIn = node.imageIn('in');
const amplifyIn = node.numberIn('amplify', 1.0, { min: 0.0, max: 100.0, step: 0.01 });
const imageOut = node.imageOut('out');
let program, copyProgram, inputBuffer, outputBuffer;

node.onStart = (props) => {
  program = figment.createShaderProgram(fragmentShader);
  copyProgram = figment.createShaderProgram();
  inputBuffer = new figment.Framebuffer();
  outputBuffer = new figment.Framebuffer();
};

node.onRender = () => {
  if (!imageIn.value) return;

  inputBuffer.setSize(imageIn.value.width, imageIn.value.height);
  outputBuffer.setSize(imageIn.value.width, imageIn.value.height);

  outputBuffer.bind();
  figment.clear();
  figment.drawQuad(program, {
    u_current_texture: imageIn.value.texture,
    u_previous_texture: inputBuffer.texture,
    u_amplify: amplifyIn.value,
  });
  outputBuffer.unbind();

  inputBuffer.bind();
  figment.clear();
  figment.drawQuad(copyProgram, { u_image: imageIn.value.texture });
  inputBuffer.unbind();

  imageOut.set(outputBuffer);
};
