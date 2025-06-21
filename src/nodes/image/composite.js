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
const fitIn = node.selectIn('fit', ['stretch', 'contain', 'cover', 'center'], 'stretch');
const imageOut = node.imageOut('out');

function updateShader() {
  let blendFunction;
  if (operationIn.value === 'normal') {
    blendFunction = 'factor * c2.rgb + (1.0 - factor) * c1.rgb';
  } else if (operationIn.value === 'darken') {
    blendFunction = 'factor * vec3(min(c1.r, c2.r), min(c1.g, c2.g), min(c1.b, c2.b)) + (1.0 - factor) * c1.rgb';
  } else if (operationIn.value === 'multiply') {
    blendFunction = 'factor * (c1.rgb * c2.rgb) + (1.0 - factor) * c1.rgb';
  } else if (operationIn.value === 'color burn') {
    blendFunction =
      'factor * vec3(blendColorBurn(c1.r,c2.r),blendColorBurn(c1.g,c2.g),blendColorBurn(c1.b,c2.b)) + (1.0 - factor) * c1.rgb';
  } else if (operationIn.value === 'lighten') {
    blendFunction = 'factor * vec3(max(c1.r, c2.r), max(c1.g, c2.g), max(c1.b, c2.b)) + (1.0 - factor) * c1.rgb';
  } else if (operationIn.value === 'screen') {
    blendFunction = 'factor * vec3(blendScreen(c1.r, c2.r), blendScreen(c1.g, c2.g), blendScreen(c1.b, c2.b))';
  } else if (operationIn.value === 'color dodge') {
    blendFunction = 'factor * vec3(blendColorDodge(c1.r, c2.r), blendColorDodge(c1.g, c2.g), blendColorDodge(c1.b, c2.b))';
  } else if (operationIn.value === 'hardmix') {
    blendFunction = 'factor * floor(c1.rgb + c2.rgb)';
  } else if (operationIn.value === 'difference') {
    blendFunction = 'factor * abs(c1.rgb - c2.rgb) + (1.0 - factor) * c1.rgb';
  } else if (operationIn.value === 'exclusion') {
    blendFunction = 'factor * c1.rgb + c2.rgb - 2.0 * c1.rgb *c2.rgb';
  } else if (operationIn.value === 'subtract') {
    blendFunction = 'factor * c1.rgb - c2.rgb';
  } else if (operationIn.value === 'divide') {
    blendFunction = 'factor * c1.rgb / c2.rgb';
  } else {
    blendFunction = 'factor * c2.rgb + (1.0 - factor) * c1.rgb';
  }
  const fragmentShader = `
  precision mediump float;
  uniform sampler2D u_image_1;
  uniform sampler2D u_image_2;
  uniform float u_factor;
  uniform vec2 u_scale;
  varying vec2 v_uv;
  float blendColorBurn(float c1, float c2) { return (c2==0.0)?c2:max((1.0-((1.0-c1)/c2)),0.0); }
  float blendScreen(float c1, float c2) { return 1.0-((1.0-c1)*(1.0-c2)); }
  float blendColorDodge(float c1, float c2) { return (c2==1.0)?c2:min(c1/(1.0-c2),1.0); }
  void main() {
    vec4 c1 = texture2D(u_image_1, v_uv);
    vec2 uv2 = u_scale * (v_uv - 0.5) + 0.5;
    vec4 c2 = vec4(0.0);
    if (uv2.x >= 0.0 && uv2.x <= 1.0 && uv2.y >= 0.0 && uv2.y <= 1.0) {
      c2 = texture2D(u_image_2, uv2);
    }
    float factor = u_factor * c2.a;
    vec3 color = ${blendFunction};
    float alpha = min(c1.a + c2.a, 1.0);
    gl_FragColor = vec4(color, alpha);
  }
  `;
  program = figment.createShaderProgram(fragmentShader);
}

let program, framebuffer;

node.onStart = (props) => {
  updateShader();
  framebuffer = new figment.Framebuffer();
};

node.onRender = () => {
  if (!image1In.value || !image2In.value) return;
  const w1 = image1In.value.width;
  const h1 = image1In.value.height;
  const w2 = image2In.value.width;
  const h2 = image2In.value.height;

  let scale = [1, 1];

  if (fitIn.value === 'center') {
    scale = [w1 / w2, h1 / h2];
  } else if (fitIn.value !== 'stretch') {
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

  framebuffer.setSize(image1In.value.width, image1In.value.height);
  framebuffer.bind();
  figment.clear();
  figment.drawQuad(program, {
    u_image_1: image1In.value.texture,
    u_image_2: image2In.value.texture,
    u_factor: factorIn.value,
    u_scale: scale,
  });
  framebuffer.unbind();
  imageOut.set(framebuffer);
};

operationIn.onChange = updateShader;
