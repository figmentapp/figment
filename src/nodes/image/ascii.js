/**
 * @name Ascii
 * @description Ascii effect on image.
 * @category image
 */

// https://www.shadertoy.com/view/4sSBDK (adapted to WGSL)
const fragmentShaderSource = `
fn gray(col: vec3f) -> f32 { return dot(col, vec3f(0.2126, 0.7152, 0.0722)); }
fn fmod(a: f32, b: f32) -> f32 { return a - b * floor(a / b); }
fn character(n: f32, p: vec2f) -> f32 {
  var pp = floor(p * vec2f(4.0, -4.0) + vec2f(2.5));
  let inX = pp.x >= 0.0 && pp.x <= 4.0;
  let inY = pp.y >= 0.0 && pp.y <= 4.0;
  let inBounds = select(0.0, 1.0, inX && inY);
  let k = pp.x + 5.0 * pp.y;
  let bit = fmod(n / exp2(k), 2.0);
  let on = select(0.0, 1.0, bit >= 1.0);
  return inBounds * on;
}

@fragment
fn fs_main(in: VertexOutput) -> @location(0) vec4f {
  let texSize = u.texSize;
  let uv_px = in.uv * texSize; // pixel coords
  let asciiDetail = max(u.detail, 1.0);
  let baseUV = floor(uv_px / asciiDetail) * asciiDetail / texSize;
  let col = textureSample(u_input_texture, defaultSampler, baseUV).rgb;
  let g = gray(col);

  let n = 65536.0 +
          step(0.2, g) * 64.0 +
          step(0.3, g) * 267172.0 +
          step(0.4, g) * 14922314.0 +
          step(0.5, g) * 8130078.0 -
          step(0.6, g) * 8133150.0 -
          step(0.7, g) * 2052562.0 -
          step(0.8, g) * 1686642.0;

  let px = u.pixels;
  let p = vec2f(fmod(uv_px.x / px, 2.0), fmod(uv_px.y / px, 2.0)) - vec2f(0.1);
  let ch = character(n, p);

  let colOutColor = col * ch;
  let colOutGray = vec3f(g) * vec3f(ch);
  let result = mix(colOutColor, colOutGray, u.color);
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
  target = new figment.RenderTarget();
  const fragmentShader = figment.makeFragmentShader(fragmentShaderSource, {
    uniformsSpec: { detail: 'f32', pixels: 'f32', color: 'f32', texSize: 'vec2f' },
    textures: ['u_input_texture'],
  });
  pipeline = figment.createRenderPipeline({ fragmentShader, format: target.format, label: 'image.ascii.wgpu' });
};

node.onRender = () => {
  if (!imageIn.value || !imageIn.value.view) return;
  const w = imageIn.value.width | 0;
  const h = imageIn.value.height | 0;
  if (w <= 0 || h <= 0) return;
  const colorMode = colorIn.value === 'Color' ? 0.0 : 1.0;
  target.setSize(w, h);
  target.bind([0, 0, 0, 0]);
  figment.drawFullscreen(
    pipeline,
    {
      uniforms: { detail: detailIn.value, pixels: pixelsIn.value, color: colorMode, texSize: [w, h] },
      uniformsSpec: { detail: 'f32', pixels: 'f32', color: 'f32', texSize: 'vec2f' },
      textures: { u_input_texture: imageIn.value.view },
    },
    target,
  );
  target.unbind();
  imageOut.set(target);
};
