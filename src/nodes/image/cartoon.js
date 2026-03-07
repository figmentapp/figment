/**
 * @name Cartoon
 * @description Render cartoon like image.
 * @category image
 */

// demo: https://www.shadertoy.com/view/MslfWj // Ruofei Du

const FRAGMENT_WGSL = `
struct Uniforms {
  u_num: f32,
};
@group(0) @binding(0) var<uniform> u: Uniforms;
@group(0) @binding(1) var defaultSampler: sampler;
@group(0) @binding(2) var u_input_texture: texture_2d<f32>;

const rgb2yuv_mat = mat3x3f(
  vec3f(0.2126, -0.09991, 0.615),
  vec3f(0.7152, -0.33609, -0.55861),
  vec3f(0.0722, 0.436, -0.05639)
);

const yuv2rgb_mat = mat3x3f(
  vec3f(1.0, 1.0, 1.0),
  vec3f(0.0, -0.21482, 2.12798),
  vec3f(1.28033, -0.38059, 0.0)
);

fn rgb2yuv(rgb: vec3f) -> vec3f {
  return rgb2yuv_mat * rgb;
}

fn yuv2rgb(yuv: vec3f) -> vec3f {
  return yuv2rgb_mat * yuv;
}

@fragment
fn fs_main(in: VertexOutput) -> @location(0) vec4f {
  let uv = in.uv;
  let color = textureSample(u_input_texture, defaultSampler, uv);
  let yuv = rgb2yuv(color.rgb);
  let rgb = yuv2rgb(vec3f(floor(yuv.x * u.u_num) / u.u_num, yuv.y, yuv.z));
  return vec4f(rgb, 1.0);
}
`;

const imageIn = node.imageIn('in');
const num = node.numberIn('amount', 3.0, { min: 2.0, max: 8.0, step: 0.1 });
const imageOut = node.imageOut('out');

let pipeline, target;

node.onStart = () => {
  pipeline = figment.createRenderPipeline({
    wgsl: FRAGMENT_WGSL,
    uniforms: { u_num: 'f32' },
    textures: ['u_input_texture'],
    label: 'cartoon',
  });
  target = new figment.RenderTarget();
};

node.onRender = () => {
  if (!imageIn.value) return;
  target.setSize(imageIn.value.width, imageIn.value.height);
  figment.drawFullscreen(pipeline, { u_num: num.value }, { u_input_texture: imageIn.value }, target);
  imageOut.set(target);
};

node.onStop = () => {
  target?.destroy();
};
