/**
 * @name Invert
 * @description Invert the colors of input image.
 * @category image
 */

const fragmentShaderSource = `
@fragment
fn fs_main(in: VertexOutput) -> @location(0) vec4f {
  let c = textureSample(u_input_texture, defaultSampler, in.uv);
  return vec4f(1.0 - c.rgb, c.a);
}
`;

const imageIn = node.imageIn('in');
const imageOut = node.imageOut('out');

let pipeline, target;

node.onStart = () => {
  target = new figment.RenderTarget();
  const fragmentShader = figment.makeFragmentShader(fragmentShaderSource, {
    uniformsSpec: {},
    textures: ['u_input_texture'],
  });
  pipeline = figment.createRenderPipeline({ fragmentShader, format: target.format, label: 'image.invert' });
};

node.onRender = () => {
  if (!imageIn.value || !imageIn.value.view) return;
  const w = imageIn.value.width | 0;
  const h = imageIn.value.height | 0;
  if (w <= 0 || h <= 0) return;
  target.setSize(w, h);
  target.bind([0, 0, 0, 0]);
  figment.drawFullscreen(pipeline, { uniforms: {}, uniformsSpec: {}, textures: { u_input_texture: imageIn.value.view } }, target);
  target.unbind();
  imageOut.set(target);
};
