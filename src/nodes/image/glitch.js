/**
 * @name Glitch
 * @description Glitches on input image.
 * @category image
 */

const fragmentShader = `
precision mediump float;
uniform sampler2D u_input_texture;
uniform float u_randomSeed;
varying vec2 v_uv;
void main() {
  vec2 uv = v_uv;

  // Add random noise to the UV coordinates
  float noise = fract(sin(dot(uv + u_randomSeed, vec2(12.9898, 78.233)) * 43758.5453));
  uv += (noise - 0.5) * 0.2;

  // Sample the texture at the modified UV coordinates
  vec4 color = texture2D(u_input_texture, uv);

  // Apply a color shift effect based on the x and y coordinates
  float shiftX = sin(uv.x * 0.01 + u_randomSeed) * 0.1;
  float shiftY = sin(uv.y * 0.01 + u_randomSeed) * 0.1;
  color.r = texture2D(u_input_texture, vec2(uv.x + shiftX, uv.y + shiftY)).r;
  color.g = texture2D(u_input_texture, vec2(uv.x - shiftX, uv.y - shiftY)).g;
  color.b = texture2D(u_input_texture, vec2(uv.x + shiftY, uv.y - shiftX)).b;

  // Output the color
  gl_FragColor = color;
}
`;

const imageIn = node.imageIn('in');
const seedIn = node.numberIn('seed', 50.0, { min: 0.0, max: 1000.0, step: 1.0 });
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
  figment.drawQuad(program, { u_input_texture: imageIn.value.texture, u_randomSeed: seedIn.value });
  framebuffer.unbind();
  imageOut.set(framebuffer);
};
