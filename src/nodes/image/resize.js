/**
 * @name Resize
 * @description Resize the input image.
 * @category image
 */

const fragmentShaderSource = `
@fragment
fn fs_main(in: VertexOutput) -> @location(0) vec4f {
  // Remap UVs based on scale for fill/contain/cover semantics
  let uv = u.scale * (in.uv - vec2f(0.5)) + vec2f(0.5);
  // Branch-free bounds mask and sampling
  let in0 = step(0.0, uv.x) * step(0.0, uv.y);
  let in1 = step(uv.x, 1.0) * step(uv.y, 1.0);
  let mask = in0 * in1;
  let color = textureSample(u_input_texture, defaultSampler, clamp(uv, vec2f(0.0), vec2f(1.0)));
  return mix(u.background_color, color, mask);
}
`;

const imageIn = node.imageIn('in');
const widthIn = node.numberIn('width', 512, { min: 0 });
const heightIn = node.numberIn('height', 512, { min: 0 });
const fitIn = node.selectIn('fit', ['fill', 'contain', 'cover'], 'cover');
const backgroundIn = node.colorIn('background', [0, 0, 0, 1]);
const imageOut = node.imageOut('out');

let pipeline, target;

node.onStart = () => {
  // Create target first so the pipeline can use the same color format
  target = new figment.RenderTarget();

  const fragmentShader = figment.makeFragmentShader(fragmentShaderSource, {
    uniformsSpec: { scale: 'vec2f', background_color: 'vec4f' },
    textures: ['u_input_texture'],
  });
  pipeline = figment.createRenderPipeline({ fragmentShader, label: 'image.resize.wgpu', format: target.format });
};

const LANDSCAPE = 1;
const PORTRAIT = 2;

node.onRender = () => {
  if (!imageIn.value || !imageIn.value.view) return;
  const outW = Math.floor(widthIn.value || 0);
  const outH = Math.floor(heightIn.value || 0);
  if (outW <= 0 || outH <= 0) return;

  const inRatio = imageIn.value.width / imageIn.value.height;
  const outRatio = outW / outH;
  let aspect;
  let orientation;
  if (inRatio > outRatio) {
    orientation = LANDSCAPE;
    aspect = inRatio / outRatio;
  } else {
    orientation = PORTRAIT;
    aspect = outRatio / inRatio;
  }

  let scale;
  if (fitIn.value === 'fill') {
    scale = [1, 1];
  } else if (fitIn.value === 'contain') {
    scale = orientation === LANDSCAPE ? [1, aspect] : [aspect, 1];
  } else {
    // cover
    scale = orientation === LANDSCAPE ? [1 / aspect, 1] : [1, 1 / aspect];
  }

  const color = backgroundIn.value;
  target.setSize(outW, outH);
  target.bind([0, 0, 0, 0]);
  figment.drawFullscreen(
    pipeline,
    {
      uniforms: {
        scale,
        background_color: [color[0] / 255, color[1] / 255, color[2] / 255, color[3]],
      },
      uniformsSpec: { scale: 'vec2f', background_color: 'vec4f' },
      textures: { u_input_texture: imageIn.value.view },
    },
    target,
  );
  target.unbind();
  imageOut.set(target);
};
