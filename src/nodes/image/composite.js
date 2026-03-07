/**
 * @name Composite
 * @description Combine two images together.
 * @category image
 */

const image1In = node.imageIn('image 1');
const image2In = node.imageIn('image 2');
const factorIn = node.numberIn('factor', 0.5, { min: 0, max: 1, step: 0.01 });
const operationIn = node.selectIn(
  'operation',
  [
    'normal',
    'darken',
    'multiply',
    'color burn',
    '---',
    'lighten',
    'screen',
    'color dodge',
    '---',
    'hardmix',
    'difference',
    'exclusion',
    'subtract',
    'divide',
  ],
  'normal',
);
const fitIn = node.selectIn('fit', ['contain', 'cover', 'stretch'], 'contain');
const imageOut = node.imageOut('out');

const uniformsMeta = { u_factor: 'f32', u_scale: 'vec2f' };
const preamble = figment.generateWgslPreamble({ uniforms: uniformsMeta, textures: ['u_image_1', 'u_image_2'] });

function updateShader() {
  let blendFunction;
  if (operationIn.value === 'normal') {
    blendFunction = 'factor * c2.rgb + (1.0 - factor) * c1.rgb';
  } else if (operationIn.value === 'darken') {
    blendFunction = 'factor * vec3f(min(c1.r, c2.r), min(c1.g, c2.g), min(c1.b, c2.b)) + (1.0 - factor) * c1.rgb';
  } else if (operationIn.value === 'multiply') {
    blendFunction = 'factor * (c1.rgb * c2.rgb) + (1.0 - factor) * c1.rgb';
  } else if (operationIn.value === 'color burn') {
    blendFunction =
      'factor * vec3f(blendColorBurn(c1.r,c2.r),blendColorBurn(c1.g,c2.g),blendColorBurn(c1.b,c2.b)) + (1.0 - factor) * c1.rgb';
  } else if (operationIn.value === 'lighten') {
    blendFunction = 'factor * vec3f(max(c1.r, c2.r), max(c1.g, c2.g), max(c1.b, c2.b)) + (1.0 - factor) * c1.rgb';
  } else if (operationIn.value === 'screen') {
    blendFunction = 'factor * vec3f(blendScreen(c1.r, c2.r), blendScreen(c1.g, c2.g), blendScreen(c1.b, c2.b))';
  } else if (operationIn.value === 'color dodge') {
    blendFunction = 'factor * vec3f(blendColorDodge(c1.r, c2.r), blendColorDodge(c1.g, c2.g), blendColorDodge(c1.b, c2.b))';
  } else if (operationIn.value === 'hardmix') {
    blendFunction = 'factor * floor(c1.rgb + c2.rgb)';
  } else if (operationIn.value === 'difference') {
    blendFunction = 'factor * abs(c1.rgb - c2.rgb) + (1.0 - factor) * c1.rgb';
  } else if (operationIn.value === 'exclusion') {
    blendFunction = 'factor * c1.rgb + c2.rgb - 2.0 * c1.rgb * c2.rgb';
  } else if (operationIn.value === 'subtract') {
    blendFunction = 'factor * c1.rgb - c2.rgb';
  } else if (operationIn.value === 'divide') {
    blendFunction = 'factor * c1.rgb / c2.rgb';
  } else {
    blendFunction = 'factor * c2.rgb + (1.0 - factor) * c1.rgb';
  }
  const fragmentWgsl =
    preamble +
    `
fn blendColorBurn(c1: f32, c2: f32) -> f32 {
  if (c2 == 0.0) { return c2; }
  return max((1.0 - ((1.0 - c1) / c2)), 0.0);
}
fn blendScreen(c1: f32, c2: f32) -> f32 { return 1.0 - ((1.0 - c1) * (1.0 - c2)); }
fn blendColorDodge(c1: f32, c2: f32) -> f32 {
  if (c2 == 1.0) { return c2; }
  return min(c1 / (1.0 - c2), 1.0);
}

@fragment
fn fs_main(in: VertexOutput) -> @location(0) vec4f {
  let c1 = textureSample(u_image_1, defaultSampler, in.uv);
  let uv2 = u.u_scale * (in.uv - 0.5) + 0.5;
  var c2 = vec4f(0.0);
  if (uv2.x >= 0.0 && uv2.x <= 1.0 && uv2.y >= 0.0 && uv2.y <= 1.0) {
    c2 = textureSampleLevel(u_image_2, defaultSampler, uv2, 0.0);
  }
  let factor = u.u_factor * c2.a;
  let color = ${blendFunction};
  let alpha = min(c1.a + c2.a, 1.0);
  return vec4f(color, alpha);
}
`;
  pipeline = figment.createRenderPipeline({
    wgsl: fragmentWgsl,
    uniforms: uniformsMeta,
    textures: ['u_image_1', 'u_image_2'],
    label: 'composite',
  });
}

let pipeline, target;

node.onStart = () => {
  updateShader();
  target = new figment.RenderTarget();
};

node.onRender = () => {
  if (!image1In.value || !image2In.value) return;
  const w1 = image1In.value.width;
  const h1 = image1In.value.height;
  const w2 = image2In.value.width;
  const h2 = image2In.value.height;

  let scale = [1, 1];

  if (fitIn.value !== 'stretch') {
    const inRatio = w2 / h2;
    const outRatio = w1 / h1;
    let aspect, orientation;
    if (inRatio > outRatio) {
      orientation = 1; // LANDSCAPE
      aspect = inRatio / outRatio;
    } else {
      orientation = 2; // PORTRAIT
      aspect = outRatio / inRatio;
    }

    if (fitIn.value === 'contain') {
      scale = orientation === 1 ? [1, aspect] : [aspect, 1];
    } else if (fitIn.value === 'cover') {
      scale = orientation === 1 ? [1 / aspect, 1] : [1, 1 / aspect];
    }
  }

  target.setSize(w1, h1);
  figment.drawFullscreen(
    pipeline,
    { u_factor: factorIn.value, u_scale: scale },
    { u_image_1: image1In.value, u_image_2: image2In.value },
    target,
  );
  imageOut.set(target);
};

node.onStop = () => {
  target?.destroy();
};

operationIn.onChange = updateShader;
