/**
 * @name Stack
 * @description Combine 2 images horizontally / vertically.
 * @category image
 */

const imageIn1 = node.imageIn('image 1');
const imageIn2 = node.imageIn('image 2');
const directionIn = node.selectIn('Direction', ['Horizontal', 'Vertical']);
const imageOut = node.imageOut('out');

let pipeline, target;

node.onStart = () => {
  target = new figment.RenderTarget();
  const wgsl = figment.makeFragmentWGSL(
    `
    let uv = in.uv;
    // Build horizontal/vertical uv mappings, pick by uniform direction (0: H, 1: V)
    let uv1_h = vec2f(uv.x * 2.0, uv.y);
    let uv2_h = vec2f(uv.x * 2.0 - 1.0, uv.y);
    let uv1_v = vec2f(uv.x, uv.y * 2.0);
    let uv2_v = vec2f(uv.x, uv.y * 2.0 - 1.0);
    let uv1 = mix(uv1_h, uv1_v, u.direction);
    let uv2 = mix(uv2_h, uv2_v, u.direction);
    // Region selector along x (H) or y (V)
    let selCoord = mix(uv.x, uv.y, u.direction);
    let m2 = step(0.5, selCoord);
    let m1 = 1.0 - m2;
    // Always sample both, clamp to [0,1]
    let c1 = textureSample(u_input_texture_1, defaultSampler, clamp(uv1, vec2f(0.0), vec2f(1.0)));
    let c2 = textureSample(u_input_texture_2, defaultSampler, clamp(uv2, vec2f(0.0), vec2f(1.0)));
    return c1 * m1 + c2 * m2;
    `,
    { uniformsSpec: { direction: 'f32' }, textures: ['u_input_texture_1', 'u_input_texture_2'] },
  );
  pipeline = figment.createRenderPipeline({ fragmentWGSL: wgsl, label: 'image.stack.wgpu', format: target.format });
};

node.onRender = () => {
  if (!imageIn1.value || !imageIn1.value.view || !imageIn2.value || !imageIn2.value.view) return;
  let direction = 0.0;
  let outW, outH;
  if (directionIn.value === 'Horizontal') {
    direction = 0.0;
    outW = (imageIn1.value.width | 0) + (imageIn2.value.width | 0);
    outH = Math.max(imageIn1.value.height | 0, imageIn2.value.height | 0);
  } else {
    direction = 1.0;
    outW = Math.max(imageIn1.value.width | 0, imageIn2.value.width | 0);
    outH = (imageIn1.value.height | 0) + (imageIn2.value.height | 0);
  }
  if (outW <= 0 || outH <= 0) return;
  target.setSize(outW, outH);
  target.bind([0, 0, 0, 0]);
  figment.drawFullscreen(
    pipeline,
    {
      uniforms: { direction },
      uniformsSpec: { direction: 'f32' },
      textures: { u_input_texture_1: imageIn1.value.view, u_input_texture_2: imageIn2.value.view },
    },
    target,
  );
  target.unbind();
  imageOut.set(target);
};
