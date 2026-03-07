/**
 * @name Difference
 * @description Calculate the difference between this image and the previous one.
 * @category image
 */

const FRAGMENT_WGSL =
  figment.generateWgslPreamble({ uniforms: { u_amplify: 'f32' }, textures: ['u_current_texture', 'u_previous_texture'] }) +
  `
@fragment
fn fs_main(in: VertexOutput) -> @location(0) vec4f {
  let currentColor = textureSample(u_current_texture, defaultSampler, in.uv).rgb;
  let previousColor = textureSample(u_previous_texture, defaultSampler, in.uv).rgb;

  // Calculate absolute difference between current and previous color
  let diff = abs(previousColor - currentColor) * u.u_amplify;

  return vec4f(diff, 1.0);
}
`;

const COPY_WGSL =
  figment.generateWgslPreamble({ textures: ['u_image'] }) +
  `
@fragment
fn fs_main(in: VertexOutput) -> @location(0) vec4f {
  return textureSample(u_image, defaultSampler, in.uv);
}
`;

const imageIn = node.imageIn('in');
const amplifyIn = node.numberIn('amplify', 1.0, { min: 0.0, max: 100.0, step: 0.01 });
const imageOut = node.imageOut('out');
let pipeline, copyPipeline, inputBuffer, outputBuffer;

node.onStart = () => {
  pipeline = figment.createRenderPipeline({
    wgsl: FRAGMENT_WGSL,
    uniforms: { u_amplify: 'f32' },
    textures: ['u_current_texture', 'u_previous_texture'],
    label: 'difference',
  });
  copyPipeline = figment.createRenderPipeline({
    wgsl: COPY_WGSL,
    uniforms: {},
    textures: ['u_image'],
    label: 'difference-copy',
  });
  inputBuffer = new figment.RenderTarget();
  outputBuffer = new figment.RenderTarget();
};

node.onRender = () => {
  if (!imageIn.value) return;

  inputBuffer.setSize(imageIn.value.width, imageIn.value.height);
  outputBuffer.setSize(imageIn.value.width, imageIn.value.height);

  figment.drawFullscreen(
    pipeline,
    { u_amplify: amplifyIn.value },
    { u_current_texture: imageIn.value, u_previous_texture: inputBuffer },
    outputBuffer,
  );

  figment.drawFullscreen(copyPipeline, {}, { u_image: imageIn.value }, inputBuffer);

  imageOut.set(outputBuffer);
};

node.onStop = () => {
  inputBuffer?.destroy();
  outputBuffer?.destroy();
};
