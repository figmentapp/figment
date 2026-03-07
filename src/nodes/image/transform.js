/**
 * @name Transform
 * @description Translate/rotate/scale the image.
 * @category image
 */

const FRAGMENT_WGSL = `
struct Uniforms {
  u_transform: mat4x4f,
};
@group(0) @binding(0) var<uniform> u: Uniforms;
@group(0) @binding(1) var defaultSampler: sampler;
@group(0) @binding(2) var u_input_texture: texture_2d<f32>;

@fragment
fn fs_main(in: VertexOutput) -> @location(0) vec4f {
  // Convert UV to clip space, apply inverse transform, convert back to UV
  let clipPos = vec4f(in.uv * 2.0 - 1.0, 0.0, 1.0);
  let transformed = u.u_transform * clipPos;
  let uv = transformed.xy * 0.5 + 0.5;
  if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) {
    return vec4f(0.0, 0.0, 0.0, 0.0);
  }
  return textureSampleLevel(u_input_texture, defaultSampler, uv, 0.0);
}
`;

const imageIn = node.imageIn('in');
const translateXIn = node.numberIn('translateX', 0, { min: -2, max: 2, step: 0.01 });
const translateYIn = node.numberIn('translateY', 0, { min: -2, max: 2, step: 0.01 });
const scaleXIn = node.numberIn('scaleX', 1, { min: -10, max: 10, step: 0.01 });
const scaleYIn = node.numberIn('scaleY', 1, { min: -10, max: 10, step: 0.01 });
const rotateIn = node.numberIn('rotate', 0.0, { min: -360, max: 360, step: 1 });
const imageOut = node.imageOut('out');

let pipeline, target;

node.onStart = () => {
  pipeline = figment.createRenderPipeline({
    wgsl: FRAGMENT_WGSL,
    uniforms: { u_transform: 'mat4x4f' },
    textures: ['u_input_texture'],
    label: 'transform',
  });
  target = new figment.RenderTarget();
};

node.onRender = () => {
  if (!imageIn.value) return;

  // Build inverse transform in UV space so we can sample the source
  // The original used a vertex shader transform; here we apply the inverse in the fragment shader.
  const angle = (-rotateIn.value * Math.PI) / 180;
  const cosA = Math.cos(angle);
  const sinA = Math.sin(angle);
  const sx = 1.0 / scaleXIn.value;
  const sy = 1.0 / scaleYIn.value;
  const tx = -translateXIn.value;
  const ty = -translateYIn.value;

  // Column-major mat4x4: translate(-tx,-ty) * rotate(-angle) * scale(1/sx, 1/sy)
  // Combined: first translate, then rotate, then scale
  const transform = [
    sx * cosA,
    sx * sinA,
    0,
    0,
    -sy * sinA,
    sy * cosA,
    0,
    0,
    0,
    0,
    1,
    0,
    tx * sx * cosA - ty * sy * sinA,
    tx * sx * sinA + ty * sy * cosA,
    0,
    1,
  ];

  target.setSize(imageIn.value.width, imageIn.value.height);
  figment.drawFullscreen(pipeline, { u_transform: transform }, { u_input_texture: imageIn.value }, target);
  imageOut.set(target);
};

node.onStop = () => {
  target?.destroy();
};
