/**
 * @name Sobel
 * @description Sobel edge detection on input image.
 * @category image
 */

const fragmentShaderSource = `
@fragment
fn fs_main(in: VertexOutput) -> @location(0) vec4f {
  let uv = in.uv;
  let w = 1.0 / u.texSize.x;
  let h = 1.0 / u.texSize.y;

  let c00 = textureSample(input_texture, defaultSampler, uv + vec2f(-w, -h));
  let c01 = textureSample(input_texture, defaultSampler, uv + vec2f( 0.0, -h));
  let c02 = textureSample(input_texture, defaultSampler, uv + vec2f( w, -h));
  let c10 = textureSample(input_texture, defaultSampler, uv + vec2f(-w,  0.0));
  let c11 = textureSample(input_texture, defaultSampler, uv);
  let c12 = textureSample(input_texture, defaultSampler, uv + vec2f( w,  0.0));
  let c20 = textureSample(input_texture, defaultSampler, uv + vec2f(-w,  h));
  let c21 = textureSample(input_texture, defaultSampler, uv + vec2f( 0.0,  h));
  let c22 = textureSample(input_texture, defaultSampler, uv + vec2f( w,  h));

  let sobel_h = c02 + (2.0 * c12) + c22 - (c00 + (2.0 * c10) + c20);
  let sobel_v = c00 + (2.0 * c01) + c02 - (c20 + (2.0 * c21) + c22);
  let sobel = sqrt(sobel_h * sobel_h + sobel_v * sobel_v);
  return vec4f(1.0 - sobel.rgb, 1.0);
}
`;

const imageIn = node.imageIn('in');
const imageOut = node.imageOut('out');

let pipeline, target;

node.onStart = () => {
  target = new figment.RenderTarget();
  const fragmentShader = figment.makeFragmentShader(fragmentShaderSource, {
    uniformsSpec: { texSize: 'vec2f' },
    textures: ['input_texture'],
  });
  pipeline = figment.createRenderPipeline({ fragmentShader, label: 'image.sobel', format: target.format });
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
    {
      uniforms: { texSize: [w, h] },
      uniformsSpec: { texSize: 'vec2f' },
      textures: { input_texture: imageIn.value.view },
    },
    target,
  );
  target.unbind();
  imageOut.set(target);
};
