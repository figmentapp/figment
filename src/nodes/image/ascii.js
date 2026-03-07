/**
 * @name Ascii
 * @description Ascii effect on image.
 * @category image
 */

// https://www.shadertoy.com/view/4sSBDK

const FRAGMENT_WGSL = `
struct Uniforms {
  u_detail: f32,
  u_pixels: f32,
  u_color: f32,
  _pad1: f32,
  u_resolution: vec2f,
};
@group(0) @binding(0) var<uniform> u: Uniforms;
@group(0) @binding(1) var defaultSampler: sampler;
@group(0) @binding(2) var u_input_texture: texture_2d<f32>;

fn grayScale(col: vec3f) -> f32 {
  return dot(col, vec3f(0.2126, 0.7152, 0.0722));
}

fn character(n: f32, p_in: vec2f) -> f32 {
  let p = floor(p_in * vec2f(4.0, -4.0) + 2.5);
  if (clamp(p.x, 0.0, 4.0) == p.x && clamp(p.y, 0.0, 4.0) == p.y
      && i32(n / exp2(p.x + 5.0 * p.y)) % 2 == 1) {
    return 1.0;
  }
  return 0.0;
}

@fragment
fn fs_main(in: VertexOutput) -> @location(0) vec4f {
  let uv = in.uv * u.u_resolution;
  let col = textureSample(u_input_texture, defaultSampler, floor(uv / u.u_detail) * u.u_detail / u.u_resolution).rgb;
  let gray = grayScale(col);
  var n = 65536.0 +
          step(0.2, gray) * 64.0 +
          step(0.3, gray) * 267172.0 +
          step(0.4, gray) * 14922314.0 +
          step(0.5, gray) * 8130078.0 -
          step(0.6, gray) * 8133150.0 -
          step(0.7, gray) * 2052562.0 -
          step(0.8, gray) * 1686642.0;

  let p = (uv / u.u_pixels) % 2.0 - vec2f(0.1);

  var result: vec3f;
  if (u.u_color == 0.0) {
    result = col * character(n, p);
  } else {
    result = gray * vec3f(character(n, p));
  }
  return vec4f(result, 1.0);
}
`;

const imageIn = node.imageIn('in');
const detailIn = node.numberIn('detail', 20.0, { min: 2, max: 50.0, step: 1 });
const pixelsIn = node.numberIn('pixel size', 4.5, { min: 1.0, max: 50.0, step: 0.5 });
const colorIn = node.selectIn('Color', ['Color', 'Gray']);
const imageOut = node.imageOut('out');

let pipeline, target;

node.onStart = () => {
  pipeline = figment.createRenderPipeline({
    wgsl: FRAGMENT_WGSL,
    uniforms: { u_detail: 'f32', u_pixels: 'f32', u_color: 'f32', _pad1: 'f32', u_resolution: 'vec2f' },
    textures: ['u_input_texture'],
    label: 'ascii',
  });
  target = new figment.RenderTarget();
};

node.onRender = () => {
  if (!imageIn.value) return;
  target.setSize(imageIn.value.width, imageIn.value.height);
  let u_color;
  if (colorIn.value === 'Color') {
    u_color = 0.0;
  } else {
    u_color = 1.0;
  }
  figment.drawFullscreen(
    pipeline,
    {
      u_detail: detailIn.value,
      u_pixels: pixelsIn.value,
      u_color,
      u_resolution: [imageIn.value.width, imageIn.value.height],
    },
    { u_input_texture: imageIn.value },
    target,
  );
  imageOut.set(target);
};

node.onStop = () => {
  target?.destroy();
};
