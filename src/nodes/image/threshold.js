/**
 * @name Threshold
 * @description Change brightness threshold of input image.
 * @category image
 */

const imageIn = node.imageIn('in');
const thresholdIn = node.numberIn('threshold', 0.5, { min: 0, max: 1, step: 0.01 });
const imageOut = node.imageOut('out');

let pipeline, target;

node.onStart = () => {
  target = new figment.RenderTarget();
  const wgsl = figment.makeFragmentWGSL(
    `
    let col = textureSample(u_input_texture, defaultSampler, in.uv).rgb;
    let brightness = (col.r + col.g + col.b) / 3.0;
    let b = step(u.threshold, brightness);
    return vec4f(vec3f(b), 1.0);
    `,
    { uniformsSpec: { threshold: 'f32' }, textures: ['u_input_texture'] },
  );
  pipeline = figment.createRenderPipeline({ fragmentWGSL: wgsl, label: 'image.threshold.wgpu', format: target.format });
};

node.onRender = () => {
  if (!imageIn.value || !imageIn.value.view) return;
  const w = imageIn.value.width | 0;
  const h = imageIn.value.height | 0;
  if (w <= 0 || h <= 0) return;
  target.setSize(w, h);
  target.bind([0, 0, 0, 0]);
  figment.drawFullscreen(
    pipeline,
    { uniforms: { threshold: thresholdIn.value }, uniformsSpec: { threshold: 'f32' }, textures: { u_input_texture: imageIn.value.view } },
    target,
  );
  target.unbind();
  imageOut.set(target);
};
