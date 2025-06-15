/**
 * @name INMS
 * @description INMS (Intensity-based Non-Maximum Suppression) edge detection on input image.
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

  // Sample the texture at the current UV coordinate and its neighbors
  float center = texture2D(u_input_texture, v_uv).r;
  float top = texture2D(u_input_texture, v_uv + vec2(0.0, u_texel_size.y)).r;
  float bottom = texture2D(u_input_texture, v_uv - vec2(0.0, u_texel_size.y)).r;
  float left = texture2D(u_input_texture, v_uv - vec2(u_texel_size.x, 0.0)).r;
  float right = texture2D(u_input_texture, v_uv + vec2(u_texel_size.x, 0.0)).r;

  // Compute the gradient and its magnitude
  float gx = (right - left) / (2.0 * u_texel_size.x);
  float gy = (top - bottom) / (2.0 * u_texel_size.y);
  float gradientMagnitude = sqrt(gx * gx + gy * gy);

  // Compute the local gradient direction
  float gradientDirection = atan(gy, gx);

  // Round the direction to one of four cardinal directions
  float directionSign = sign(gradientDirection);
  float absDirection = abs(gradientDirection);
  float mod = mod(absDirection, 0.5 * 3.14159265359);
  float roundedDirection = directionSign * (absDirection - mod + 0.25 * 3.14159265359);

  // Compute the magnitudes of the gradients in the two orthogonal directions
  float magnitude1 = abs(cos(roundedDirection)) * gradientMagnitude * u_increase;
  float magnitude2 = abs(sin(roundedDirection)) * gradientMagnitude * u_increase;

  // Compute the non-maximum suppressed edge intensity
  float suppressedIntensity = center - 0.5 * (magnitude1 + magnitude2);

  // Output the edge intensity as grayscale
  //gl_FragColor = vec4(vec3(suppressedIntensity), 1.0);
  gl_FragColor = vec4(vec3(step(u_threshold, suppressedIntensity)), 1.0);
}
`;

const imageIn = node.imageIn('in');
const blurIn = node.numberIn('blur', 2.0, { min: 0.0, max: 10.0, step: 0.01 });
const increaseIn = node.numberIn('increase fx', 0.02, { min: 0.0, max: 0.5, step: 0.001 });
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
