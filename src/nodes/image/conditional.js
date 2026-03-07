/**
 * @name Conditional
 * @description Render an image conditionally.
 * @category image
 */

const uniformsMeta = { u_factor: 'f32' };
const textures = ['u_true_image', 'u_false_image'];
const FRAGMENT_WGSL =
  figment.generateWgslPreamble({ uniforms: uniformsMeta, textures }) +
  `
@fragment
fn fs_main(in: VertexOutput) -> @location(0) vec4f {
  let c1 = textureSample(u_true_image, defaultSampler, in.uv);
  let c2 = textureSample(u_false_image, defaultSampler, in.uv);
  let color = (1.0 - u.u_factor) * c1.rgb + u.u_factor * c2.rgb;
  let alpha = (1.0 - u.u_factor) * c1.a + u.u_factor * c2.a;
  return vec4f(color, alpha);
}
`;

const conditionIn = node.booleanIn('condition');
conditionIn.display = 0x03;
const trueImageIn = node.imageIn('true image');
const falseImageIn = node.imageIn('false image');
const fadeTimeIn = node.numberIn('fade time', 0.5, { min: 0, max: 10, step: 0.1 });
const biasIn = node.numberIn('fade bias', 0.5, { min: 0, max: 1, step: 0.01 });
const imageOut = node.imageOut('out');

let pipeline, target;

let prevTime;
let factor = 0;
let direction = 1;

node.onStart = () => {
  pipeline = figment.createRenderPipeline({
    wgsl: FRAGMENT_WGSL,
    uniforms: uniformsMeta,
    textures,
    label: 'conditional',
  });
  target = new figment.RenderTarget();
  prevTime = Date.now();
};

node.onRender = () => {
  const dt = (Date.now() - prevTime) / 1000; // convert ms to s
  prevTime = Date.now();

  if (!trueImageIn.value || !falseImageIn.value) return;

  direction = conditionIn.value ? -1 : 1;
  let bias = biasIn.value;
  let adjustedFadeTime = fadeTimeIn.value * (direction === 1 ? bias : 1 - bias);
  adjustedFadeTime = Math.max(adjustedFadeTime, 0.0001); // Avoid division by zero
  factor = factor + (direction * dt) / adjustedFadeTime;
  factor = Math.min(Math.max(factor, 0), 1);

  target.setSize(trueImageIn.value.width, trueImageIn.value.height);
  figment.drawFullscreen(pipeline, { u_factor: factor }, { u_true_image: trueImageIn.value, u_false_image: falseImageIn.value }, target);
  imageOut.set(target);
};

node.onStop = () => {
  target?.destroy();
};
