/**
 * @name Bleach Bypass
 * @description Bleach bypass shader
 * @category image
 */

const FRAGMENT_WGSL = `
// Bleach bypass shader [http://en.wikipedia.org/wiki/Bleach_bypass]
// based on Nvidia example
// http://developer.download.nvidia.com/shaderlibrary/webpages/shader_library.html#post_bleach_bypass

struct Uniforms {
  u_opacity: f32,
};
@group(0) @binding(0) var<uniform> u: Uniforms;
@group(0) @binding(1) var defaultSampler: sampler;
@group(0) @binding(2) var u_input_texture: texture_2d<f32>;

@fragment
fn fs_main(in: VertexOutput) -> @location(0) vec4f {
  let base = textureSample(u_input_texture, defaultSampler, in.uv);

  let lumCoeff = vec3f(0.25, 0.65, 0.1);
  let lum = dot(lumCoeff, base.rgb);
  let blend = vec3f(lum);
  let L = min(1.0, max(0.0, 10.0 * (lum - 0.45)));

  let result1 = 2.0 * base.rgb * blend;
  let result2 = 1.0 - 2.0 * (1.0 - blend) * (1.0 - base.rgb);

  let newColor = mix(result1, result2, vec3f(L));
  let A2 = u.u_opacity * base.a;
  var mixRGB = A2 * newColor.rgb;
  mixRGB = mixRGB + ((1.0 - A2) * base.rgb);
  return vec4f(mixRGB, base.a);
}
`;

const imageIn = node.imageIn('in');
const opacityIn = node.numberIn('opacity', 1.0, { min: 0.0, max: 2.0, step: 0.01 });
const imageOut = node.imageOut('out');

let pipeline, target;

node.onStart = () => {
  pipeline = figment.createRenderPipeline({
    wgsl: FRAGMENT_WGSL,
    uniforms: { u_opacity: 'f32' },
    textures: ['u_input_texture'],
    label: 'bleachBypass',
  });
  target = new figment.RenderTarget();
};

node.onRender = () => {
  if (!imageIn.value) return;
  target.setSize(imageIn.value.width, imageIn.value.height);
  figment.drawFullscreen(pipeline, { u_opacity: opacityIn.value }, { u_input_texture: imageIn.value }, target);
  imageOut.set(target);
};

node.onStop = () => {
  target?.destroy();
};
