/**
 * @name Emboss
 * @description Emboss convolution on an input image.
 * @category image
 */

const FRAGMENT_WGSL = `
struct Uniforms {
  u_emboss: vec2f,
};
@group(0) @binding(0) var<uniform> u: Uniforms;
@group(0) @binding(1) var defaultSampler: sampler;
@group(0) @binding(2) var u_input_texture: texture_2d<f32>;

fn sample_pixel(uv: vec2f, dx: f32, dy: f32) -> vec4f {
  return textureSample(u_input_texture, defaultSampler, uv + vec2f(dx, dy));
}

@fragment
fn fs_main(in: VertexOutput) -> @location(0) vec4f {
  let uv = in.uv;
  let dx = u.u_emboss.x;
  let dy = u.u_emboss.y;

  // Build color matrix
  var cm: array<vec4f, 9>;
  cm[0] = vec4f(sample_pixel(uv, -dx, -dy).rgb, 0.0);
  cm[1] = vec4f(sample_pixel(uv, -dx, 0.0).rgb, 0.0);
  cm[2] = vec4f(sample_pixel(uv, -dx,  dy).rgb, 0.0);
  cm[3] = vec4f(sample_pixel(uv, 0.0, -dy).rgb, 0.0);
  cm[4] = vec4f(sample_pixel(uv, 0.0, 0.0).rgb, 0.0);
  cm[5] = vec4f(sample_pixel(uv, 0.0,  dy).rgb, 0.0);
  cm[6] = vec4f(sample_pixel(uv,  dx, -dy).rgb, 0.0);
  cm[7] = vec4f(sample_pixel(uv,  dx, 0.0).rgb, 0.0);
  cm[8] = vec4f(sample_pixel(uv,  dx,  dy).rgb, 0.0);

  // Build mean matrix (store mean in w component)
  for (var i = 0; i < 9; i = i + 1) {
    cm[i] = vec4f(cm[i].rgb, (cm[i].r + cm[i].g + cm[i].b) / 3.0);
  }

  // Emboss kernel
  let kernel = array<f32, 9>(2.0, 0.0, 0.0, 0.0, -1.0, 0.0, 0.0, 0.0, -1.0);

  // Convolve
  var res: f32 = 0.0;
  for (var i = 0; i < 9; i = i + 1) {
    res = res + kernel[i] * cm[i].w;
  }
  let convolved = clamp(res + 0.5, 0.0, 1.0);

  return vec4f(vec3f(convolved), 1.0);
}
`;

const imageIn = node.imageIn('in');
const embossWidthIn = node.numberIn('emboss width', 0.0015, { min: 0.0, max: 0.1, step: 0.0001 });
const embossHeightIn = node.numberIn('emboss height', 0.0015, { min: 0.0, max: 0.1, step: 0.0001 });
const imageOut = node.imageOut('out');

let pipeline, target;

node.onStart = () => {
  pipeline = figment.createRenderPipeline({
    wgsl: FRAGMENT_WGSL,
    uniforms: { u_emboss: 'vec2f' },
    textures: ['u_input_texture'],
    label: 'emboss',
  });
  target = new figment.RenderTarget();
};

node.onRender = () => {
  if (!imageIn.value) return;
  target.setSize(imageIn.value.width, imageIn.value.height);
  figment.drawFullscreen(pipeline, { u_emboss: [embossWidthIn.value, embossHeightIn.value] }, { u_input_texture: imageIn.value }, target);
  imageOut.set(target);
};

node.onStop = () => {
  target?.destroy();
};
