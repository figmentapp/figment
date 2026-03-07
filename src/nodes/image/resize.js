/**
 * @name Resize
 * @description Resize the input image
 * @category image
 */

const FRAGMENT_WGSL = `
struct Uniforms {
  u_background_color: vec4f,
  u_scale: vec2f,
};
@group(0) @binding(0) var<uniform> u: Uniforms;
@group(0) @binding(1) var defaultSampler: sampler;
@group(0) @binding(2) var u_input_texture: texture_2d<f32>;

@fragment
fn fs_main(in: VertexOutput) -> @location(0) vec4f {
  let uv = u.u_scale * (in.uv - 0.5) + 0.5;
  if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) {
    return u.u_background_color;
  }
  return textureSampleLevel(u_input_texture, defaultSampler, uv, 0.0);
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
  pipeline = figment.createRenderPipeline({
    wgsl: FRAGMENT_WGSL,
    uniforms: { u_background_color: 'vec4f', u_scale: 'vec2f' },
    textures: ['u_input_texture'],
    label: 'resize',
  });
  target = new figment.RenderTarget();
};

const LANDSCAPE = 1;
const PORTRAIT = 2;

node.onRender = () => {
  if (!imageIn.value) return;
  let inRatio = imageIn.value.width / imageIn.value.height;
  let outRatio = widthIn.value / heightIn.value;
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
  if (fitIn.value == 'fill') {
    scale = [1, 1];
  } else if (fitIn.value == 'contain') {
    if (orientation === LANDSCAPE) {
      scale = [1, aspect];
    } else {
      scale = [aspect, 1];
    }
  } else if (fitIn.value == 'cover') {
    if (orientation === LANDSCAPE) {
      scale = [1 / aspect, 1];
    } else {
      scale = [1, 1 / aspect];
    }
  }

  const color = backgroundIn.value;
  target.setSize(widthIn.value, heightIn.value);
  figment.drawFullscreen(
    pipeline,
    {
      u_background_color: [color[0] / 255, color[1] / 255, color[2] / 255, color[3]],
      u_scale: scale,
    },
    { u_input_texture: imageIn.value },
    target,
  );
  imageOut.set(target);
};

node.onStop = () => {
  target?.destroy();
};
