/**
 * @name Noise
 * @description Adds noise on input image.
 * @category image
 */

const fragmentShader = `
precision mediump float;
uniform sampler2D u_input_texture;
uniform float u_seed;
uniform float u_noise_intensity;
varying vec2 v_uv;

float rand(vec2 n) {
    return fract(sin(dot(n, vec2(12.9898, 78.233))) * 43758.5453 + u_seed);
}

void main() {
    vec2 uv = v_uv;
    vec4 color = texture2D(u_input_texture, uv);
    //same with color not b/w
    //vec3 noise = vec3(rand(uv), rand(uv + vec2(5.2, 1.3)), rand(uv + vec2(-2.4, 3.7))) * u_noise_intensity;
    //gl_FragColor = vec4(color.rgb + noise, color.a);
    float noise = rand(uv) * u_noise_intensity;
    vec3 noise_color = vec3(noise);
    vec3 blended_color = mix(color.rgb, noise_color, 0.5);
    gl_FragColor = vec4(blended_color, color.a);
}
`;

const imageIn = node.imageIn('in');
const noiseIn = node.numberIn('noise factor', 2.0, { min: 0.0, max: 10.0, step: 0.01 });
const seedIn = node.numberIn('seed', 2.0, { min: 0.0, max: 100.0, step: 0.0001 });
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
  figment.drawQuad(program, { u_input_texture: imageIn.value.texture, u_noise_intensity: noiseIn.value, u_seed: seedIn.value });
  framebuffer.unbind();
  imageOut.set(framebuffer);
};
