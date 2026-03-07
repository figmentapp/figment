/**
 * @name Lookup
 * @description Map the colors of one image to another image.
 * @category image
 */

const sourceIn = node.imageIn('source');
const lookupIn = node.imageIn('lookup');
const methodIn = node.selectIn('method', ['luminance', 'red', 'green', 'blue', 'alpha']);
const imageOut = node.imageOut('out');

let pipeline, target;

node.onStart = () => {
  updateShader();
  target = new figment.RenderTarget();
};

function updateShader() {
  let lookupFunction;
  if (methodIn.value === 'luminance') {
    lookupFunction = 'dot(source.rgb, vec3f(0.299, 0.587, 0.114))';
  } else if (methodIn.value === 'red') {
    lookupFunction = 'source.r';
  } else if (methodIn.value === 'green') {
    lookupFunction = 'source.g';
  } else if (methodIn.value === 'blue') {
    lookupFunction = 'source.b';
  } else if (methodIn.value === 'alpha') {
    lookupFunction = 'source.a';
  }
  const preamble = figment.generateWgslPreamble({
    textures: ['u_source_texture', 'u_lookup_texture'],
  });
  const FRAGMENT_WGSL = `${preamble}

@fragment
fn fs_main(in: VertexOutput) -> @location(0) vec4f {
  let uv = in.uv;
  let source = textureSample(u_source_texture, defaultSampler, uv);
  let value = ${lookupFunction};
  let lookup = textureSample(u_lookup_texture, defaultSampler, vec2f(value, 0.5));
  return lookup;
}
`;
  pipeline = figment.createRenderPipeline({
    wgsl: FRAGMENT_WGSL,
    uniforms: {},
    textures: ['u_source_texture', 'u_lookup_texture'],
    label: 'lookup',
  });
}

node.onRender = () => {
  if (!sourceIn.value) return;
  if (!lookupIn.value) return;
  target.setSize(sourceIn.value.width, sourceIn.value.height);
  figment.drawFullscreen(pipeline, {}, { u_source_texture: sourceIn.value, u_lookup_texture: lookupIn.value }, target);
  imageOut.set(target);
};

node.onStop = () => {
  target?.destroy();
};

methodIn.onChange = updateShader;
