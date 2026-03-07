/**
 * @name Mask Image
 * @description Mask the input image with another image.
 * @category image
 */

const uniformsMeta = { u_mask_method: 'i32' };
const textures = ['u_source_texture', 'u_mask_texture'];
const FRAGMENT_WGSL =
  figment.generateWgslPreamble({ uniforms: uniformsMeta, textures }) +
  `
@fragment
fn fs_main(in: VertexOutput) -> @location(0) vec4f {
  let input_color = textureSample(u_source_texture, defaultSampler, in.uv);
  let mask_color = textureSample(u_mask_texture, defaultSampler, in.uv);
  if (u.u_mask_method == 1) {
    // Mask method 1: use the color component of the image.
    return vec4f(input_color.r, input_color.g, input_color.b, input_color.a * mask_color.r);
  } else {
    // Mask method 2: use the alpha component of the mask image.
    return vec4f(input_color.r, input_color.g, input_color.b, input_color.a * mask_color.a);
  }
}
`;

const sourceIn = node.imageIn('source');
const maskIn = node.imageIn('mask');
const maskMethodIn = node.selectIn('maskMethod', ['white', 'alpha']);
const imageOut = node.imageOut('out');

let pipeline, target;

node.onStart = () => {
  pipeline = figment.createRenderPipeline({
    wgsl: FRAGMENT_WGSL,
    uniforms: uniformsMeta,
    textures,
    label: 'maskImage',
  });
  target = new figment.RenderTarget();
};

node.onRender = () => {
  if (!sourceIn.value) return;
  if (!maskIn.value) {
    imageOut.set(sourceIn.value);
    return;
  }
  target.setSize(sourceIn.value.width, sourceIn.value.height);
  figment.drawFullscreen(
    pipeline,
    { u_mask_method: maskMethodIn.value === 'white' ? 1 : 2 },
    { u_source_texture: sourceIn.value, u_mask_texture: maskIn.value },
    target,
  );
  imageOut.set(target);
};

node.onStop = () => {
  target?.destroy();
};
