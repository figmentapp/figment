/**
 * @name Center Around Gray
 * @description center around gray on image.
 * @category image
 */

const FRAGMENT_WGSL = `
struct Uniforms {
  u_radius: f32,
  _pad1: f32,
  u_center: vec2f,
};
@group(0) @binding(0) var<uniform> u: Uniforms;
@group(0) @binding(1) var defaultSampler: sampler;
@group(0) @binding(2) var u_input_texture: texture_2d<f32>;

fn grayScale(col: vec3f) -> f32 {
  return dot(col, vec3f(0.3, 0.59, 0.11));
}

@fragment
fn fs_main(in: VertexOutput) -> @location(0) vec4f {
  let uv = in.uv;
  let col = textureSample(u_input_texture, defaultSampler, uv).rgb;
  let dist = distance(uv, u.u_center);
  let vignette = smoothstep(u.u_radius, u.u_radius - 0.1, dist);
  let gray = vec3f(grayScale(col));
  let result = mix(gray, col, clamp(vignette, 0.0, 1.0));
  return vec4f(result, 1.0);
}
`;

const imageIn = node.imageIn('in');
const radiusIn = node.numberIn('radius', 0.4, { min: 0.0, max: 1.0, step: 0.01 });
const centerXIn = node.numberIn('center x', 0.5, { min: 0.0, max: 1.0, step: 0.01 });
const centerYIn = node.numberIn('center y', 0.5, { min: 0.0, max: 1.0, step: 0.01 });
const imageOut = node.imageOut('out');

let pipeline, target;

node.onStart = () => {
  pipeline = figment.createRenderPipeline({
    wgsl: FRAGMENT_WGSL,
    uniforms: { u_radius: 'f32', _pad1: 'f32', u_center: 'vec2f' },
    textures: ['u_input_texture'],
    label: 'centerAroundGray',
  });
  target = new figment.RenderTarget();
};

node.onRender = () => {
  if (!imageIn.value) return;
  target.setSize(imageIn.value.width, imageIn.value.height);
  figment.drawFullscreen(
    pipeline,
    {
      u_radius: radiusIn.value,
      u_center: [centerXIn.value, centerYIn.value],
    },
    { u_input_texture: imageIn.value },
    target,
  );
  imageOut.set(target);
};

node.onStop = () => {
  target?.destroy();
};
