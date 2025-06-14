/**
 * @name LoG Edges
 * @description Laplacian of Gaussian (LoG) edge detection on input image.
 * @category image
 */

const fragmentShader = `
precision mediump float;
uniform vec2 u_texel_size;
uniform float u_increase;
uniform sampler2D u_input_texture;
uniform float u_threshold;
varying vec2 v_uv;

void main() {
  vec2 uv = v_uv;

  // Create a 5x5 kernel for LoG
  float kernel[25];
  kernel[0] = 0.003765; kernel[1] = 0.015019; kernel[2] = 0.023792; kernel[3] = 0.015019; kernel[4] = 0.003765;
  kernel[5] = 0.015019; kernel[6] = 0.059912; kernel[7] = 0.094907; kernel[8] = 0.059912; kernel[9] = 0.015019;
  kernel[10] = 0.023792; kernel[11] = 0.094907; kernel[12] = 0.150342; kernel[13] = 0.094907; kernel[14] = 0.023792;
  kernel[15] = 0.015019; kernel[16] = 0.059912; kernel[17] = 0.094907; kernel[18] = 0.059912; kernel[19] = 0.015019;
  kernel[20] = 0.003765; kernel[21] = 0.015019; kernel[22] = 0.023792; kernel[23] = 0.015019; kernel[24] = 0.003765;

  // Normalize the kernel
  float sum = 0.0;
  for (int i = 0; i < 25; i++) {
      sum += kernel[i];
  }
  for (int i = 0; i < 25; i++) {
      kernel[i] /= sum;
  }

  // Compute the LoG filter by convolving the image with the kernel
  float edge = 0.0;
  float intensity=0.0;
  for (int i = -2; i <= 2; i++) {
      for (int j = -2; j <= 2; j++) {
          vec2 offset = vec2(float(i), float(j)) * u_texel_size;
          intensity = texture2D(u_input_texture, uv + offset).r;
          edge += intensity * kernel[(i+2)*5 + (j+2)];
      }
  }
  edge *= u_increase;
  // Output the edge as a grayscale value in the red, green, and blue channels
  //gl_FragColor = vec4(vec3(edge), 1.0);
  //gl_FragColor = vec4(vec3(suppressedIntensity), 1.0);
  gl_FragColor = vec4(vec3(step(u_threshold, edge),edge,edge), 1.0);

}
`;

const imageIn = node.imageIn('in');
const blurIn = node.numberIn('blur', 2.0, { min: 0.0, max: 10.0, step: 0.01 });
const increaseIn = node.numberIn('increase fx', 2.0, { min: 0.0, max: 10.0, step: 0.01 });
const thresholdIn = node.numberIn('threshold', 0.5, { min: 0.0, max: 1.0, step: 0.01 });
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
    u_texel_size: [blurIn.value / imageIn.value.width, blurIn.value / imageIn.value.height],
    u_increase: increaseIn.value,
    u_threshold: thresholdIn.value,
  });
  framebuffer.unbind();
  imageOut.set(framebuffer);
};
