/**
 * @name INMS
 * @description INMS (Intensity-based Non-Maximum Suppression) edge detection on input image.
 * @category image
 */

const FRAGMENT_WGSL = `
struct Uniforms {
  u_texel_size: vec2f,
  u_increase: f32,
  u_threshold: f32,
};
@group(0) @binding(0) var<uniform> u: Uniforms;
@group(0) @binding(1) var defaultSampler: sampler;
@group(0) @binding(2) var u_input_texture: texture_2d<f32>;

@fragment
fn fs_main(in: VertexOutput) -> @location(0) vec4f {
  let uv = in.uv;

  // Sample the texture at the current UV coordinate and its neighbors
  let center = textureSample(u_input_texture, defaultSampler, uv).r;
  let top = textureSample(u_input_texture, defaultSampler, uv + vec2f(0.0, u.u_texel_size.y)).r;
  let bottom = textureSample(u_input_texture, defaultSampler, uv - vec2f(0.0, u.u_texel_size.y)).r;
  let left = textureSample(u_input_texture, defaultSampler, uv - vec2f(u.u_texel_size.x, 0.0)).r;
  let right = textureSample(u_input_texture, defaultSampler, uv + vec2f(u.u_texel_size.x, 0.0)).r;

  // Compute the gradient and its magnitude
  let gx = (right - left) / (2.0 * u.u_texel_size.x);
  let gy = (top - bottom) / (2.0 * u.u_texel_size.y);
  let gradientMagnitude = sqrt(gx * gx + gy * gy);

  // Compute the local gradient direction
  let gradientDirection = atan2(gy, gx);

  // Round the direction to one of four cardinal directions
  let directionSign = sign(gradientDirection);
  let absDirection = abs(gradientDirection);
  let m = absDirection - floor(absDirection / (0.5 * 3.14159265359)) * (0.5 * 3.14159265359);
  let roundedDirection = directionSign * (absDirection - m + 0.25 * 3.14159265359);

  // Compute the magnitudes of the gradients in the two orthogonal directions
  let magnitude1 = abs(cos(roundedDirection)) * gradientMagnitude * u.u_increase;
  let magnitude2 = abs(sin(roundedDirection)) * gradientMagnitude * u.u_increase;

  // Compute the non-maximum suppressed edge intensity
  let suppressedIntensity = center - 0.5 * (magnitude1 + magnitude2);

  // Output the edge intensity as grayscale
  return vec4f(vec3f(step(u.u_threshold, suppressedIntensity)), 1.0);
}
`;

const imageIn = node.imageIn('in');
const blurIn = node.numberIn('blur', 2.0, { min: 0.0, max: 10.0, step: 0.01 });
const increaseIn = node.numberIn('increase fx', 0.02, { min: 0.0, max: 0.5, step: 0.001 });
const thresholdIn = node.numberIn('threshold', 0.5, { min: 0.0, max: 1.0, step: 0.01 });
const imageOut = node.imageOut('out');

let pipeline, target;

node.onStart = () => {
  pipeline = figment.createRenderPipeline({
    wgsl: FRAGMENT_WGSL,
    uniforms: { u_texel_size: 'vec2f', u_increase: 'f32', u_threshold: 'f32' },
    textures: ['u_input_texture'],
    label: 'inms',
  });
  target = new figment.RenderTarget();
};

node.onRender = () => {
  if (!imageIn.value) return;
  target.setSize(imageIn.value.width, imageIn.value.height);
  figment.drawFullscreen(
    pipeline,
    {
      u_texel_size: [blurIn.value / imageIn.value.width, blurIn.value / imageIn.value.height],
      u_increase: increaseIn.value,
      u_threshold: thresholdIn.value,
    },
    { u_input_texture: imageIn.value },
    target,
  );
  imageOut.set(target);
};

node.onStop = () => {
  target?.destroy();
};
