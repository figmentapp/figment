/**
 * @name Denoise
 * @description Noise reduction filter on input image.
 * @category image
 */

const fragmentShader = `
precision mediump float;
uniform vec2 u_texel_size;
uniform sampler2D u_input_texture;
varying vec2 v_uv;

void main() {
  vec2 uv = v_uv;
  vec4 center = texture2D(u_input_texture, uv);
  vec4 sum = vec4(0.0);
  float totalWeight = 0.0;

  for (float x = -1.0; x <= 1.0; x += 1.0) {
    for (float y = -1.0; y <= 1.0; y += 1.0) {
      vec2 offset = vec2(x, y) * u_texel_size;
      vec4 sample = texture2D(u_input_texture, uv + offset);
      float weight = 1.0 / (1.0 + length(sample.rgb - center.rgb));
      sum += sample * weight;
      totalWeight += weight;
    }
  }

  gl_FragColor = sum / totalWeight;
}
`;

const imageIn = node.imageIn('in');
const noiseIn = node.numberIn('denoise factor', 2.0, { min: 0.0, max: 10.0, step: 0.01 });
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
    u_texel_size: [noiseIn.value / imageIn.value.width, noiseIn.value / imageIn.value.height],
  });
  framebuffer.unbind();
  imageOut.set(framebuffer);
};
