/**
 * @name Reaction Diffusion
 * @description Reaction diffusion on input image.
 * @category image
 */

const fragmentShader = `
precision mediump float;
uniform sampler2D u_input_texture;
uniform sampler2D u_prev_texture;
uniform vec2 u_resolution;
varying vec2 v_uv;
uniform float u_influence;
uniform float u_delta_time;
uniform float u_feed_rate;
uniform float u_kill_rate;
uniform float u_diffusion_rate_a;
uniform float u_diffusion_rate_b;

void main() {
  vec2 uv = v_uv;
  vec2 texel_size = 1.0 / u_resolution;

  vec4 current = texture2D(u_input_texture, uv);
  vec4 laplacian = texture2D(u_input_texture, uv + vec2(-1.0, 0.0) * texel_size) +
                   texture2D(u_input_texture, uv + vec2(1.0, 0.0) * texel_size) +
                   texture2D(u_input_texture, uv + vec2(0.0, -1.0) * texel_size) +
                   texture2D(u_input_texture, uv + vec2(0.0, 1.0) * texel_size) -
                   4.0 * current;

  vec4 pixel = current + texture2D(u_prev_texture, uv) * u_influence;
  float a = pixel.r;
  float b = pixel.g;

  float reaction = a * b * b;
  float da = u_diffusion_rate_a * laplacian.r - reaction + u_feed_rate * (1.0 - a);
  float db = u_diffusion_rate_b * laplacian.g + reaction - (u_kill_rate + u_feed_rate) * b;

  vec2 result = current.rg + vec2(da, db) * u_delta_time;
  gl_FragColor = vec4(result.r, result.g, 0.0, 1.0);
}
`;

const imageIn = node.imageIn('in');
const influenceIn = node.numberIn('influence', 0.15, { min: 0.0, max: 1.0, step: 0.01 });
const deltaTimeIn = node.numberIn('delta time', 1.0);
const feedRateIn = node.numberIn('feed rate', 0.037, { min: 0.0, max: 0.1, step: 0.0001 });
const killRateIn = node.numberIn('kill rate', 0.06, { min: 0.0, max: 0.1, step: 0.0001 });
const diffusionRateAIn = node.numberIn('diffusion A', 0.2097, { min: 0.0, max: 1.0, step: 0.0001 });
const diffusionRateBIn = node.numberIn('diffusion B', 0.105, { min: 0.0, max: 1.0, step: 0.0001 });
const iterationsIn = node.numberIn('iterations', 10, { min: 1, max: 50, step: 1 });
const resetIn = node.triggerButtonIn('reset');
const imageOut = node.imageOut('out');

let program, copyProgram, framebuffer, pingPongFramebuffers;

node.onStart = (props) => {
  program = figment.createShaderProgram(fragmentShader);
  framebuffer = new figment.Framebuffer();
  pingPongFramebuffers = [new figment.Framebuffer(), new figment.Framebuffer()];
};

node.onRender = () => {
  if (!imageIn.value) return;

  const width = imageIn.value.width;
  const height = imageIn.value.height;

  framebuffer.setSize(width, height);
  pingPongFramebuffers[0].setSize(width, height);
  pingPongFramebuffers[1].setSize(width, height);

  // Perform reaction-diffusion iterations
  for (let i = 0; i < iterationsIn.value; i++) {
    pingPongFramebuffers[1].bind();
    figment.clear();
    figment.drawQuad(program, {
      u_input_texture: pingPongFramebuffers[0].texture,
      u_prev_texture: imageIn.value.texture,
      u_resolution: [width, height],
      u_influence: influenceIn.value,
      u_delta_time: deltaTimeIn.value,
      u_feed_rate: feedRateIn.value,
      u_kill_rate: killRateIn.value,
      u_diffusion_rate_a: diffusionRateAIn.value,
      u_diffusion_rate_b: diffusionRateBIn.value,
    });
    pingPongFramebuffers[1].unbind();

    // Swap ping-pong framebuffers
    const temp = pingPongFramebuffers[0];
    pingPongFramebuffers[0] = pingPongFramebuffers[1];
    pingPongFramebuffers[1] = temp;
  }

  framebuffer.bind();
  figment.clear();
  figment.drawQuad(program, { u_input_texture: pingPongFramebuffers[0].texture });
  framebuffer.unbind();

  imageOut.set(framebuffer);
};

function resetSimulation() {
  pingPongFramebuffers[0].bind();
  figment.clear();
  pingPongFramebuffers[0].unbind();
}
node.onReset = resetSimulation;
resetIn.onTrigger = resetSimulation;
