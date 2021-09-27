export const core = {};
export const math = {};
export const graphics = {};
export const color = {};
export const image = {};
export const ml = {};

core.sequence = `// Execute the connected nodes in the correct order.
const triggerIn = node.triggerIn('in');
for (let i = 1; i <= 8; i++) {
  node.triggerOut(\`out\${i}\`)
}
triggerIn.onTrigger = (props) => {
  for (const outPort of node.outPorts) {
    outPort.trigger(props);
  }
};
`;

core.time = `// Get the current time (in frames and seconds).
const frameOut = node.numberOut('frame', 0);
const secondsOut = node.numberOut('seconds', 0);

node.onStart = (props) => {
  node._frame = 0;
  node._startTime = Date.now();
}

node.onFrame = () => {
  node._frame++;
  frameOut.set(node._frame);
  secondsOut.set((Date.now() - node._startTime) / 1000);
}
`;

core.randomNumber = `// Generate random number.
import * as seedrandom from 'seedrandom';

const minIn = node.numberIn('min', 0);
const maxIn = node.numberIn('max', 100);
const stepIn = node.numberIn('step', 1);
const seedIn = node.numberIn('seed', 42);
const newSeedButton = node.triggerButtonIn('newSeed');
const valueOut = node.numberOut('value');

function generate() {
  const rng = seedrandom(seedIn.value);
  const min = minIn.value;
  const max = maxIn.value;
  const step = stepIn.value;
  let value = min + rng() * (max - min);
  if (step !== 1) {
    value = Math.round(value / step) * step;
  }
  valueOut.set(value);
  node.debugMessage = value.toFixed(2);
}
  
newSeedButton.onTrigger = (props) => {
  seedIn.set(Math.floor(Math.random() * 1000));
  generate();
};

minIn.onChange = generate;
maxIn.onChange = generate;
seedIn.onChange = generate;
`;

core.animate = `// Animate a value over time.
// const tween = require('tween-functions');
// const easings = Object.keys(tween);

const timeIn = node.numberIn('time');
const minIn = node.numberIn('min', 0);
const maxIn = node.numberIn('max', 100);
const durationIn = node.numberIn('duration', 1, { step: 0.01 });
const easingIn = node.selectIn('easing', easings);
const repeatIn = node.selectIn('repeat', ['cycle', 'none']);
const valueOut = node.numberOut('value');

function update() {
  const fn = tween[easingIn.value];
  let t;
  if (repeatIn.value === 'cycle') {
     t = timeIn.value % durationIn.value;
  } else if (repeatIn.value === 'none') {
    t = Math.min(timeIn.value, durationIn.value);
  }
  const value = fn(t, minIn.value, maxIn.value, durationIn.value);
  valueOut.set(value);
}

timeIn.onChange = update;
minIn.onChange = update;
maxIn.onChange = update;
durationIn.onChange = update;
easingIn.onChange = update;
`;

core.smooth = `// Smooth values over time.
const triggerIn = node.triggerIn('in');
const valueIn = node.numberIn('value');
const smoothIn = node.numberIn('smooth', 10);
const valueOut = node.numberOut('value');
let _currentValue;

triggerIn.onTrigger = () => {
  if (_currentValue === undefined) {
    _currentValue = valueIn.value;
  }
  _currentValue += (valueIn.value - _currentValue) / (smoothIn.value * 100);
  valueOut.set(_currentValue);
};

smoothIn.onChange = () => {
  if (smoothIn.value <= 0) {
    smoothIn.value = 1;
  }
};
`;

core.custom = `// Empty custom node.
const triggerIn = node.triggerIn('in');

triggerIn.onTrigger = (props) => {
  const { canvas, ctx } = props;
  ctx.fillStyle = 'red';
  ctx.fillRect(10, 20, 30, 40);
};
`;

core.mouse = `// Read mouse inputs.
const xOut = node.numberOut('x');
const yOut = node.numberOut('y');
const buttonDownOut = node.toggleOut('buttonDown');
const clickTriggerOut = node.triggerOut('click');

function setDebugMessage() {
  node.debugMessage = \`[\${xOut.value} \${yOut.value}]\${buttonDownOut.value ? ' down' : ''}\`;
}

function onMouseMove(e) {
  xOut.set(e.offsetX);
  yOut.set(e.offsetY);
  setDebugMessage();
}

function onMouseDown(e) {
  buttonDownOut.set(true);
  clickTriggerOut.trigger();
  setDebugMessage();
}

function onMouseUp(e) {
  buttonDownOut.set(false);
  setDebugMessage();
}

node.onStart = (props) => {
  let viewer = document.getElementById('viewer');
  let canvas = viewer.querySelector('canvas');
  if (!canvas) canvas = viewer;
  canvas.addEventListener('mousedown', onMouseDown);
  canvas.addEventListener('mouseup', onMouseUp);
  canvas.addEventListener('mousemove', onMouseMove);
  setDebugMessage();
}

node.onStop = (props) => {
  let viewer = document.getElementById('viewer');
  let canvas = viewer.querySelector('canvas');
  if (!canvas) canvas = viewer;
  canvas.removeEventListener('mousemove', onMouseDown);
  canvas.removeEventListener('mousemove', onMouseUp);
  canvas.removeEventListener('mousemove', onMouseMove);
};
`;

core.conditionalTrigger = `// Trigger based on true / false condition.
const triggerIn = node.triggerIn('in');
const valueIn = node.toggleIn('value');
const trueTriggerOut = node.triggerOut('true');
const falseTriggerOut = node.triggerOut('false');

triggerIn.onTrigger = (props) => {
  if (valueIn.value) {
    trueTriggerOut.trigger(props);
  } else {
    falseTriggerOut.trigger(props);
  }
};
`;

math.convert = `// Convert values from one domain to another.
const valueIn = node.numberIn('value', 0.5);
const inMinIn = node.numberIn('inMin', 0);
const inMaxIn = node.numberIn('inMax', 1);
const outMinIn = node.numberIn('outMin', 0);
const outMaxIn = node.numberIn('outMax', 255);
const valueOut = node.numberOut('value');

const onChange = () => {
  let v = valueIn.value;
  // Convert from input to 0-1.
  try {
    v = (v - inMinIn.value) / (inMaxIn.value - inMinIn.value);
  } catch (e) {
    v = inMin.value;
  }
  // Convert from 0-1 to target domain.
  v = outMinIn.value + v * (outMaxIn.value - outMinIn.value);
  valueOut.set(v);
};

valueIn.onChange = onChange;
inMinIn.onChange = onChange;
inMaxIn.onChange = onChange;
outMinIn.onChange = onChange;
outMaxIn.onChange = onChange;
`;

graphics.canvas = `// Initialize a new canvas and triggers the render every frame.
const playingIn = node.toggleIn('playing', true);
const widthIn = node.numberIn('width', 500);
const heightIn = node.numberIn('height', 500);
const drawBackgroundIn = node.toggleIn('drawBackground', true);
const backgroundColorIn = node.colorIn('color', [20, 20, 30, 1]);
const triggerOut = node.triggerOut('out');

function resize() {
  const viewer = document.getElementById('viewer');
  let canvas = viewer.querySelector('canvas');
  if (!canvas) {
    canvas = document.createElement('canvas');
    viewer.appendChild(canvas);
  }
  node._canvas = canvas;
  canvas.width = widthIn.value;
  canvas.height = heightIn.value;
  const ctx = canvas.getContext('2d');
  node._ctx = ctx;
  ctx.fillStyle = g.rgba(...backgroundColorIn.value);
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  triggerOut.trigger({ canvas, ctx });
}

function doFrame() {
  if (!playingIn.value) return;
  const canvas = node._canvas;
  const ctx = node._ctx;
  if (drawBackgroundIn.value) {
    ctx.fillStyle = g.rgba(...backgroundColorIn.value);
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }
  triggerOut.trigger({ canvas, ctx });
}

node.onStart = resize;
widthIn.onChange = resize;
heightIn.onChange = resize;
node.onFrame = doFrame;
playingIn.onChange = doFrame;
`;

graphics.backgroundColor = `// Fill the entire canvas with the background color.
const triggerIn = node.triggerIn('in');
const colorIn = node.colorIn('color', [20, 20, 30, 1]);
const enableIn = node.toggleIn('enable', true);
const triggerOut = node.triggerOut('out');

triggerIn.onTrigger = (props) => {
  if (enableIn.value) {
    const { canvas, ctx } = props;
    ctx.fillStyle = g.rgba(...colorIn.value);
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }
  triggerOut.trigger(props);
};
`;

graphics.transform = `// Transform the shapes.
const SRT = 'scale rot trans';
const STR = 'scale trans rot';
const RST = 'rot scale trans';
const RTS = 'rot trans scale';
const TSR = 'trans scale rot';
const TRS = 'trans rot scale';

const triggerIn = node.triggerIn('in');
const translateX = node.numberIn('translateX', 20);
const translateY = node.numberIn('translateY', 20);
const rotate = node.numberIn('rotate', 0);
const scaleX = node.numberIn('scaleX', 1.0, { step: 0.01 });
const scaleY = node.numberIn('scaleY', 1.0, { step: 0.01 });
const order = node.selectIn('order', [SRT, STR, RST, RTS, TSR, TRS]);
const triggerOut = node.triggerOut('out');

triggerIn.onTrigger = (props) => {
  const { ctx } = props;
  ctx.save();
  switch (order.value) {
    case SRT:
      ctx.translate(translateX.value, translateY.value);
      ctx.rotate(g.toRadians(rotate.value));
      ctx.scale(scaleX.value, scaleY.value);
      break;
    case STR:
      ctx.rotate(g.toRadians(rotate.value));
      ctx.translate(translateX.value, translateY.value);
      ctx.scale(scaleX.value, scaleY.value);
      break;
    case RST:
      ctx.translate(translateX.value, translateY.value);
      ctx.scale(scaleX.value, scaleY.value);
      ctx.rotate(g.toRadians(rotate.value));
      break;
    case RTS:
      ctx.scale(scaleX.value, scaleY.value);
      ctx.translate(translateX.value, translateY.value);
      ctx.rotate(g.toRadians(rotate.value));
      break;
    case TSR:
      ctx.rotate(g.toRadians(rotate.value));
      ctx.scale(scaleX.value, scaleY.value);
      ctx.translate(translateX.value, translateY.value);
      break;
    case TRS:
      ctx.scale(scaleX.value, scaleY.value);
      ctx.rotate(g.toRadians(rotate.value));
      ctx.translate(translateX.value, translateY.value);
      break;
    default:
      throw new Error(\`Invalid transform order \${order.value}\`);
  }
  triggerOut.trigger(props);
  ctx.restore();
};
`;

graphics.clone = `// Clone and transform the shapes.
const SRT = 'scale rot trans';
const STR = 'scale trans rot';
const RST = 'rot scale trans';
const RTS = 'rot trans scale';
const TSR = 'trans scale rot';
const TRS = 'trans rot scale';

const triggerIn = node.triggerIn('in');
const amount = node.numberIn('amount', 5);
const translateX = node.numberIn('translateX', 20);
const translateY = node.numberIn('translateY', 20);
const rotate = node.numberIn('rotate', 0);
const scaleX = node.numberIn('scaleX', 1.0);
const scaleY = node.numberIn('scaleY', 1.0);
const order = node.selectIn('order', [SRT, STR, RST, RTS, TSR, TRS]);
const triggerOut = node.triggerOut('out');

triggerIn.onTrigger = (props) => {
  const { ctx } = props;
  ctx.save();
  for (let i = 0; i < amount.value; i++) {
    triggerOut.trigger(props);
    switch (order.value) {
      case SRT:
        ctx.translate(translateX.value, translateY.value);
        ctx.rotate(g.toRadians(rotate.value));
        ctx.scale(scaleX.value, scaleY.value);
        break;
      case STR:
        ctx.rotate(g.toRadians(rotate.value));
        ctx.translate(translateX.value, translateY.value);
        ctx.scale(scaleX.value, scaleY.value);
        break;
      case RST:
        ctx.translate(translateX.value, translateY.value);
        ctx.scale(scaleX.value, scaleY.value);
        ctx.rotate(g.toRadians(rotate.value));
        break;
      case RTS:
        ctx.scale(scaleX.value, scaleY.value);
        ctx.translate(translateX.value, translateY.value);
        ctx.rotate(g.toRadians(rotate.value));
        break;
      case TSR:
        ctx.rotate(g.toRadians(rotate.value));
        ctx.scale(scaleX.value, scaleY.value);
        ctx.translate(translateX.value, translateY.value);
        break;
      case TRS:
        ctx.scale(scaleX.value, scaleY.value);
        ctx.rotate(g.toRadians(rotate.value));
        ctx.translate(translateX.value, translateY.value);
        break;
      default:
        throw new Error(\`Invalid transform order \${order.value}\`);
    }
  }
  ctx.restore();
};
`;

graphics.rect = `// Draw a rectangle on the canvas.
const triggerIn = node.triggerIn('in');
const triggerOut = node.triggerOut('out');
const xIn = node.numberIn('x', 0);
const yIn = node.numberIn('y', 0);
const widthIn = node.numberIn('width', 100);
const heightIn = node.numberIn('height', 100);
const colorIn = node.colorIn('color', [255, 255, 255, 1]);

triggerIn.onTrigger = (props) => {
  const { canvas, ctx } = props;
  ctx.save();
  ctx.fillStyle = g.rgba(...colorIn.value);
  ctx.fillRect(xIn.value, yIn.value, widthIn.value, heightIn.value);
  ctx.restore();
  triggerOut.trigger(props);
};
`;

graphics.line = `// Draw a line between two points.
const triggerIn = node.triggerIn('in');
const triggerOut = node.triggerOut('out');
const x1In = node.numberIn('x1', 0);
const y1In = node.numberIn('y1', 0);
const x2In = node.numberIn('x2', 100);
const y2In = node.numberIn('y2', 100);
const colorIn = node.colorIn('color', [255, 255, 255, 1]);
const lineWidthIn = node.numberIn('lineWidth', 1);

triggerIn.onTrigger = (props) => {
  const { canvas, ctx } = props;
  ctx.strokeStyle = g.rgba(...colorIn.value);
  ctx.lineWidth = lineWidthIn.value;
  ctx.beginPath();
  ctx.moveTo(x1In.value, y1In.value);
  ctx.lineTo(x2In.value, y2In.value);
  ctx.stroke();
  triggerOut.trigger(props);
};
`;

graphics.text = `// Draw a line of text.
const triggerIn = node.triggerIn('in');
const triggerOut = node.triggerOut('out');
const textIn = node.stringIn('text', 'Hello');
const xIn = node.numberIn('x', 0);
const yIn = node.numberIn('y', 50);
const fontSizeIn = node.numberIn('fontSize', 24);
const colorIn = node.colorIn('color', [255, 255, 255, 1]);

triggerIn.onTrigger = (props) => {
  const { canvas, ctx } = props;
  ctx.font = \`\${fontSizeIn.value}px sans-serif\`;
  ctx.fillStyle = g.rgba(...colorIn.value);
  ctx.fillText(textIn.value, xIn.value, yIn.value);
  triggerOut.trigger(props);
};
`;

color.hsl = `// Generate a color from HSL values.
// const chroma = require('chroma-js'); 
const hueIn = node.numberIn('hue', 0, { min: 0, max: 360 });
const saturationIn = node.numberIn('saturation', 50, { min: 0, max: 100 });
const lightnessIn = node.numberIn('lightness', 50, { min: 0, max: 100 });
const alphaIn = node.numberIn('alpha', 1, { min: 0, max: 1, step: 0.01 });
const colorOut = node.colorOut('color');

function generate() {
  const color = chroma.hsl(hueIn.value, saturationIn.value / 100, lightnessIn.value / 100, alphaIn.value);
  colorOut.set(color.rgba());
}

hueIn.onChange = generate;
saturationIn.onChange = generate;
lightnessIn.onChange = generate;
alphaIn.onChange = generate;
`;

image.loadImage = `// Load an image from a file.

const fragmentShader = \`
precision mediump float;
uniform sampler2D u_image;
varying vec2 v_uv;
void main() {
  gl_FragColor = texture2D(u_image, v_uv);
}
\`;


const fileIn = node.fileIn('file', '');
const imageOut = node.imageOut('out');

let texture, framebuffer, program;

node.onStart = () => {
  program = figment.createShaderProgram(fragmentShader);
  framebuffer = new figment.Framebuffer();
}

function loadImage() {
  if (!fileIn.value || fileIn.value.trim().length === 0) return;
  const imageUrl = figment.urlForAsset(fileIn.value);
  figment.createTextureFromUrl(imageUrl.toString(), onLoad);
}

function onLoad(err, texture, image) {
  if (err) {
    throw new Error(\`Image load error: \${err\}\`);
  }
  framebuffer.setSize(image.naturalWidth, image.naturalHeight);
  framebuffer.bind();
  figment.drawQuad(program, { u_image: texture });
  framebuffer.unbind();
  imageOut.set(framebuffer);
}

function onError(err) {
  console.error('image.loadImage error', err);
}

fileIn.onChange = loadImage;
`;

image.drawImage = `// Draw the image on the canvas.
const triggerIn = node.triggerIn('in');
const triggerOut = node.triggerOut('out');
const imageIn = node.imageIn('image');
const xIn = node.numberIn('x');
const yIn = node.numberIn('y');
const centeredIn = node.toggleIn('centered', false);
const widthIn = node.numberIn('width', 0, { min: 0 });
const heightIn = node.numberIn('height', 0, { min: 0 });
const fitIn = node.selectIn('fit', ['contain', 'cover', 'fill']);

triggerIn.onTrigger = (props) => {
  const { canvas, ctx } = props;
  const cover = fitIn.value === 'cover';
  if (imageIn.value) {
    const sWidth = imageIn.value.width, sHeight = imageIn.value.height;
    const tWidth = widthIn.value || sWidth, tHeight = heightIn.value || sHeight;
    let dWidth, dHeight, dx = 0, dy = 0;
    if (widthIn.value === 0 && heightIn.value === 0) {
      dWidth = imageIn.value.width;
      dHeight = imageIn.value.height;
    } else if (fitIn.value === 'contain' || fitIn.value === 'cover') {
      let sRatio = sWidth / sHeight;
      let dRatio = tWidth / tHeight;
      if (cover ? sRatio < dRatio : sRatio > dRatio) {
        dWidth = tWidth;
        dHeight = tWidth / sRatio;
        if (cover) {
          dy = (dHeight - tHeight) / -2;
        } else {
          dy = (tHeight - dHeight) / 2;
        }
      } else {
        dWidth = tHeight * sRatio;
        dHeight = tHeight;
        if (cover) {
          dx = (dWidth - tWidth) / -2;
        } else {
          dx = (tWidth - dWidth) / 2;
        }
      }
    } else if (fitIn.value === 'fill') {
      dWidth = widthIn.value || imageIn.value.width;
      dHeight = heightIn.value  || imageIn.value.height;
    }
    let x, y;
    if (centeredIn.value) {
      x = xIn.value - tWidth / 2;
      y = yIn.value - tHeight / 2;
    } else {
      x = xIn.value;
      y = yIn.value;
    }
    if (cover) {
      ctx.save();
      ctx.beginPath();
      ctx.rect(x, y, tWidth, tHeight);
      ctx.clip();
      ctx.drawImage(imageIn.value, x + dx, y + dy, dWidth, dHeight);
      ctx.restore();  
    } else {
      ctx.drawImage(imageIn.value, x + dx, y + dy, dWidth, dHeight);
    }
  }
  triggerOut.trigger(props);
};
`;

image.camImage = `// Return a webcam stream

const frameRate = node.numberIn('frameRate', 10);
const imageOut = node.imageOut('image');

let _video, _stream, _timer, _framebuffer;

node.onStart = () => {
  navigator.mediaDevices.getUserMedia({
    video: true,
    audio: false
  }).then(function(stream) {
    _video = document.createElement('video');
    _video.width = 640;
    _video.height = 480;
    _video.srcObject = stream;
    _video.play();
    _stream = stream;
    _framebuffer = new figment.Framebuffer(_video.width, _video.height);
    _timer = setInterval(uploadImage, 1000 / frameRate.value);
    // uploadImage();
  })
  .catch(function(err) {
    console.error('no camera input!', err);
  });
};

node.onStop = () => {
  clearInterval(_timer);
  if (_stream.active) {
    _stream.getTracks().forEach(track => track.stop())
    _video = null;
  }
}

function uploadImage() {
  if (!_video || !_framebuffer) return;
  if (_video.readyState !== _video.HAVE_ENOUGH_DATA) return;
  _framebuffer.unbind();
  window.gl.bindTexture(window.gl.TEXTURE_2D, _framebuffer.texture);
  window.gl.texImage2D(window.gl.TEXTURE_2D, 0, window.gl.RGBA, window.gl.RGBA, window.gl.UNSIGNED_BYTE, _video);
  window.gl.bindTexture(window.gl.TEXTURE_2D, null);
  imageOut.set(_framebuffer);
}

frameRate.onChange = () => {
  clearInterval(_timer);
  _timer = setInterval(uploadImage, 1000 / frameRate.value);
}

// node.debugDraw = (ctx) => {
//   if (imageOut.value) {
//     ctx.drawImage(imageOut.value, 0, 0, 100, 75);
//   }
// }
`;

image.pixels = `// Return pixels from an image
const triggerIn = node.triggerIn('in');
const imageIn = node.imageIn('image');
const pixelsOut = node.objectOut('pixels');

triggerIn.onTrigger = (props) => {
  const { canvas, ctx } = props;
  if (imageIn.value) {
    ctx.drawImage(imageIn.value, 0, 0, canvas.width, canvas.height);
    var imagePixels = ctx.getImageData(0,0,canvas.width,canvas.height);
    pixelsOut.set(imagePixels);
  }  
}
`;

image.unsplash = `// Fetch a random image from Unsplash.
const queryIn = node.stringIn('query', 'kitten');
const widthIn = node.numberIn('width', 300);
const heightIn = node.numberIn('height', 300);
const imageOut = node.imageOut('image');

const exec = async () => {
  const url = \`https://source.unsplash.com/\${widthIn.value}x\${heightIn.value}?\${queryIn.value}\`;
  const res = await fetch(url);
  const blob = await res.blob();
  const data = URL.createObjectURL(blob);
  const img = new Image();
  img.src = data;
  img.onload = () => {
    imageOut.set(img);
  }
}

queryIn.onChange = exec;
widthIn.onChange = exec;
heightIn.onChange = exec;
`;

image.blur  = `// Blur an input image

const fragmentShader = \`
precision mediump float;
uniform sampler2D u_input_texture;
varying vec2 v_uv;
uniform float u_step;

#define BOT 1.-u_step
#define TOP 1.+u_step
#define CEN 1

void main() {
  vec2 uv = v_uv;

  gl_FragColor = 	texture2D( u_input_texture, uv*vec2(BOT, BOT))/8.
  +texture2D(u_input_texture, uv*vec2(BOT, BOT))/8.
  +texture2D(u_input_texture, uv*vec2(TOP, BOT))/8.
  +texture2D(u_input_texture, uv*vec2(BOT, CEN))/8.
  +texture2D(u_input_texture, uv*vec2(TOP, CEN))/8.
  +texture2D(u_input_texture, uv*vec2(BOT, TOP))/8.
  +texture2D(u_input_texture, uv*vec2(CEN, TOP))/8.
  +texture2D(u_input_texture, uv*vec2(TOP, TOP))/8.;

}
\`;

const imageIn = node.imageIn('in');
const blurIn = node.numberIn('amount', 0.005, { min: 0, max: 0.02, step: 0.001});
const imageOut = node.imageOut('out');

let program, framebuffer;

node.onStart = (props) => {
  program = figment.createShaderProgram(fragmentShader);
  framebuffer = new figment.Framebuffer();
};

function render() {
  if (!imageIn.value) return;
  if (!program) return;
  if (!framebuffer) return;
  framebuffer.setSize(imageIn.value.width, imageIn.value.height);
  framebuffer.bind();
  figment.drawQuad(program, { u_input_texture: imageIn.value.texture,u_step: blurIn.value });
  framebuffer.unbind();
  imageOut.set(framebuffer);
}

imageIn.onChange = render;
blurIn.onChange = render;
`;


image.constant = `// Render a constant color.

const fragmentShader = \`
precision mediump float;
uniform vec3 u_color; // R/G/B color
uniform float u_alpha;
varying vec2 v_uv;
void main() {
  gl_FragColor = vec4(u_color, u_alpha);
}
\`;

const colorIn = node.colorIn('color');
const alphaIn = node.numberIn('alpha', 1.0, { min: 0, max: 1, step: 0.01});
const widthIn = node.numberIn('width', 1024, { min: 1, max: 4096, step: 1 });
const heightIn = node.numberIn('height', 512, { min: 1, max: 4096, step: 1 });
const imageOut = node.imageOut('out');

let program, framebuffer;

node.onStart = (props) => {
  program = figment.createShaderProgram(fragmentShader);
  framebuffer = new figment.Framebuffer(widthIn.value, heightIn.value);
};

function render() {
  framebuffer.setSize(widthIn.value, heightIn.value);
  framebuffer.bind();
  figment.drawQuad(program, {
    u_color: [colorIn.value[0] / 255, colorIn.value[1] / 255, colorIn.value[2] / 255],
    u_alpha: alphaIn.value
  });
  framebuffer.unbind();
  imageOut.set(framebuffer);
}

colorIn.onChange = render;
alphaIn.onChange = render;
widthIn.onChange = render;
heightIn.onChange = render;
`;

image.crop = `// Crop input image.

const fragmentShader = \`
precision mediump float;
uniform sampler2D u_input_texture;
uniform float u_left;
uniform float u_right;
uniform float u_top;
uniform float u_bottom;
varying vec2 v_uv;

vec4 leftCrop(vec4 texColor,vec2 xy,float size)
{
    float l=step(size,xy.x);
    texColor*=l;
    return texColor;
}

vec4 rightCrop(vec4 texColor,vec2 xy,float size)
{
    float l=step(size,1.-xy.x);
    texColor*=l;
    return texColor;
}

vec4 bottomCrop(vec4 texColor,vec2 xy,float size)
{
    float l=step(size,xy.y);
    texColor*=l;
    return texColor;
}

vec4 topCrop(vec4 texColor,vec2 xy,float size)
{
    float l=step(size,1.-xy.y);
    texColor*=l;
    return texColor;
}

void main() {
  vec2 uv = v_uv;
  vec4 texColor=texture2D(u_input_texture,uv);
  
  texColor=leftCrop(texColor,uv,u_left);
  texColor=rightCrop(texColor,uv,u_right);
  texColor=topCrop(texColor,uv,u_top);
  texColor=bottomCrop(texColor,uv,u_bottom);
  
  gl_FragColor = texColor;

}
\`;

const imageIn = node.imageIn('in');
const leftIn = node.numberIn('left', 0.25, { min: 0, max: 1, step: 0.01});
const rightIn = node.numberIn('right', 0.25, { min: 0, max: 1, step: 0.01});
const topIn = node.numberIn('top', 0.1, { min: 0, max: 1, step: 0.01});
const bottomIn = node.numberIn('bottom', 0.1, { min: 0, max: 1, step: 0.01});
const imageOut = node.imageOut('out');

let program, framebuffer;

node.onStart = (props) => {
  program = figment.createShaderProgram(fragmentShader);
  framebuffer = new figment.Framebuffer();
};

function render() {
  if (!imageIn.value) return;
  if (!program) return;
  if (!framebuffer) return;
  framebuffer.setSize(imageIn.value.width, imageIn.value.height);
  framebuffer.bind();
  figment.drawQuad(program, { u_input_texture: imageIn.value.texture,
    u_left: leftIn.value, u_right: rightIn.value,u_top: topIn.value, u_bottom: bottomIn.value, });
  framebuffer.unbind();
  imageOut.set(framebuffer);
}

imageIn.onChange = render;
leftIn.onChange = render;
rightIn.onChange = render;
topIn.onChange = render;
bottomIn.onChange = render;

`;

image.emboss = `// Emboss convolution on an input image.

const fragmentShader = \`
precision mediump float;
uniform sampler2D u_input_texture;
uniform vec2 u_emboss;
varying vec2 v_uv;


vec4 sample_pixel(in vec2 uv, in float dx, in float dy)
{
    return texture2D(u_input_texture, uv + vec2(dx, dy));
}

float convolve(in float[9] kernel, in vec4[9] color_matrix)
{
   float res = 0.0;
   for (int i=0; i<9; i++)
   {
      res += kernel[i] * color_matrix[i].a;
   }
   return clamp(res + 0.5, 0.0 ,1.0);
}

void build_color_matrix(in vec2 uv, out vec4[9] color_matrix)
{
  float dx = u_emboss.x;
  float dy = u_emboss.y;
  color_matrix[0].rgb = sample_pixel(uv, -dx, -dy).rgb;
  color_matrix[1].rgb = sample_pixel(uv, -dx, 0.0).rgb;
  color_matrix[2].rgb = sample_pixel(uv, -dx,  dy).rgb;
  color_matrix[3].rgb = sample_pixel(uv, 0.0, -dy).rgb;
  color_matrix[4].rgb = sample_pixel(uv, 0.0, 0.0).rgb;
  color_matrix[5].rgb = sample_pixel(uv, 0.0,  dy).rgb;
  color_matrix[6].rgb = sample_pixel(uv,  dx, -dy).rgb;
  color_matrix[7].rgb = sample_pixel(uv,  dx, 0.0).rgb;
  color_matrix[8].rgb = sample_pixel(uv,  dx,  dy).rgb;
}

void build_mean_matrix(inout vec4[9] color_matrix)
{
   for (int i = 0; i < 9; i++)
   {
      color_matrix[i].a = (color_matrix[i].r + color_matrix[i].g + color_matrix[i].b) / 3.;
   }
}

void main() {
  vec2 uv = v_uv;

  float kernel[9];
  kernel[0] = 2.0; kernel[1] = 0.0; kernel[2] = 0.0;
  kernel[3] = 0.0; kernel[4] = -1.; kernel[5] = 0.0;
  kernel[6] = 0.0; kernel[7] = 0.0; kernel[8] = -1.;
  
  vec4 pixel_matrix[9];
  
  build_color_matrix(uv, pixel_matrix);
  build_mean_matrix(pixel_matrix);
  
  float convolved = convolve(kernel, pixel_matrix);
  gl_FragColor = vec4(vec3(convolved), 1.0);
}
\`;

const imageIn = node.imageIn('in');
const embossWidthIn = node.numberIn('emboss width', 0.0015, { min: 0.0, max: 0.1, step: 0.0001 });
const embossHeightIn = node.numberIn('emboss height', 0.0015, { min: 0.0, max: 0.1, step: 0.0001 });
const imageOut = node.imageOut('out');

let program, framebuffer;

node.onStart = (props) => {
  program = figment.createShaderProgram(fragmentShader);
  framebuffer = new figment.Framebuffer();
};

function render() {
  if (!imageIn.value) return;
  if (!program) return;
  if (!framebuffer) return;
  framebuffer.setSize(imageIn.value.width, imageIn.value.height);
  framebuffer.bind();
  figment.drawQuad(program, { 
    u_input_texture: imageIn.value.texture,
    u_emboss: [embossWidthIn.value, embossHeightIn.value]  
  });
  framebuffer.unbind();
  imageOut.set(framebuffer);
}

imageIn.onChange = render;
embossWidthIn.onChange = render;
embossHeightIn.onChange = render;
`;

image.grayscale = `// Grayscale conversion of input image.

const fragmentShader = \`
precision mediump float;
uniform sampler2D u_input_texture;
varying vec2 v_uv;

void main() {
  vec2 uv = v_uv;
  vec4 color = texture2D(u_input_texture, uv.st);
  float gray = dot(color.rgb, vec3(0.299, 0.587, 0.114));
  gl_FragColor = vec4(gray, gray, gray, 1.0);
}
\`;

const imageIn = node.imageIn('in');
const imageOut = node.imageOut('out');

let program, framebuffer;

node.onStart = (props) => {
  program = figment.createShaderProgram(fragmentShader);
  framebuffer = new figment.Framebuffer();
};

function render() {
  if (!imageIn.value) return;
  if (!program) return;
  if (!framebuffer) return;
  framebuffer.setSize(imageIn.value.width, imageIn.value.height);
  framebuffer.bind();
  figment.drawQuad(program, { u_input_texture: imageIn.value.texture });
  framebuffer.unbind();
  imageOut.set(framebuffer);
}

imageIn.onChange = render;
`;

image.invert = `// Invert colors of input image.

const fragmentShader = \`
precision mediump float;
uniform sampler2D u_input_texture;
varying vec2 v_uv;
void main() {
  gl_FragColor = texture2D(u_input_texture, v_uv);
  gl_FragColor.rgb = 1.0 - gl_FragColor.rgb;
}
\`;

const imageIn = node.imageIn('in');
const imageOut = node.imageOut('out');

let program, framebuffer;

node.onStart = (props) => {
  program = figment.createShaderProgram(fragmentShader);
  framebuffer = new figment.Framebuffer();
};

function render() {
  if (!imageIn.value) return;
  if (!program) return;
  if (!framebuffer) return;
  framebuffer.setSize(imageIn.value.width, imageIn.value.height);
  framebuffer.bind();
  figment.drawQuad(program, { u_input_texture: imageIn.value.texture });
  framebuffer.unbind();
  imageOut.set(framebuffer);
}

imageIn.onChange = render;
`;

image.levels = `// Change brightness - contrast - saturation on input image.

const fragmentShader = \`
precision mediump float;
uniform sampler2D u_input_texture;
uniform float u_brightness;
uniform float u_contrast;
uniform float u_saturation;
varying vec2 v_uv;

mat4 brightnessMatrix( float brightness )
{
    return mat4( 1, 0, 0, 0,
                 0, 1, 0, 0,
                 0, 0, 1, 0,
                 brightness, brightness, brightness, 1 );
}

mat4 contrastMatrix( float contrast )
{
  float t = ( 1.0 - contrast ) / 2.0;
    
    return mat4( contrast, 0, 0, 0,
                 0, contrast, 0, 0,
                 0, 0, contrast, 0,
                 t, t, t, 1 );

}

mat4 saturationMatrix( float saturation )
{
    vec3 luminance = vec3( 0.3086, 0.6094, 0.0820 );
    float oneMinusSat = 1.0 - saturation;
    
    vec3 red = vec3( luminance.x * oneMinusSat );
    red+= vec3( saturation, 0, 0 );
    
    vec3 green = vec3( luminance.y * oneMinusSat );
    green += vec3( 0, saturation, 0 );
    
    vec3 blue = vec3( luminance.z * oneMinusSat );
    blue += vec3( 0, 0, saturation );
    
    return mat4( red,     0,
                 green,   0,
                 blue,    0,
                 0, 0, 0, 1 );
}

void main() {
  vec2 uv = v_uv;
  vec4 color = texture2D( u_input_texture, uv );
    
  gl_FragColor = brightnessMatrix( u_brightness ) *
          contrastMatrix( u_contrast ) * 
          saturationMatrix( u_saturation ) *
          color;

  }
\`;

const imageIn = node.imageIn('in');
const brightnessIn = node.numberIn('brightness', 0.0, { min: -1, max: 1, step: 0.01 });
const contrastIn = node.numberIn('contrast', 1.0, { min: 0, max: 2, step: 0.01 });
const saturationIn = node.numberIn('saturation', 1.0, { min: 0, max: 1, step: 0.01 });
const imageOut = node.imageOut('out');

let program, framebuffer;

node.onStart = (props) => {
  program = figment.createShaderProgram(fragmentShader);
  framebuffer = new figment.Framebuffer();
};

function render() {
  if (!imageIn.value) return;
  if (!program) return;
  if (!framebuffer) return;
  framebuffer.setSize(imageIn.value.width, imageIn.value.height);
  framebuffer.bind();
  figment.drawQuad(program, { 
    u_input_texture: imageIn.value.texture,
    u_brightness: brightnessIn.value,
    u_contrast: contrastIn.value,
    u_saturation: saturationIn.value
  });
  framebuffer.unbind();
  imageOut.set(framebuffer);
}

imageIn.onChange = render;
brightnessIn.onChange = render;
contrastIn.onChange = render;
saturationIn.onChange = render;
`;


image.mirror = `// Mirror the input image over a specific axis.

const fragmentShader = \`
precision mediump float;
uniform sampler2D u_input_texture;
uniform vec2 u_resolution;
uniform vec3 u_line;
varying vec2 v_uv;
void main() {
  vec2 uv = v_uv;
  vec2 uvp = uv * u_resolution;
  float d = dot(u_line, vec3(uvp, 1.0));
  if (d > 0.0) {
    uvp.x = uvp.x - 2.0 * u_line.x * d;
    uvp.y = uvp.y - 2.0 * u_line.y * d;
    uv = uvp / u_resolution;
  }
  gl_FragColor = texture2D(u_input_texture, uv);
}
\`;

const imageIn = node.imageIn('in');
// const pivotIn = node.number2In('pivot', [0.5, 0.5], { min: 0, max: 1, step: 0.01 } );
const pivotXIn = node.numberIn('pivotX', 0.5, { min: 0, max: 1, step: 0.01 } );
const pivotYIn = node.numberIn('pivotY', 0.5, { min: 0, max: 1, step: 0.01 } );
const angleIn = node.numberIn('angle', 90, { min: -180, max: 180, step: 1 });
const imageOut = node.imageOut('out');

let program, framebuffer;

node.onStart = (props) => {
  program = figment.createShaderProgram(fragmentShader);
  framebuffer = new figment.Framebuffer();
};

function render() {
  if (!imageIn.value) return;
  if (!program) return;
  if (!framebuffer) return;
  const r = angleIn.value * Math.PI / 180;
  const x = Math.sin(r);
  const y = -Math.cos(r);
  const z = -((pivotXIn.value * x * imageIn.value.width) + (pivotYIn.value * y * imageIn.value.height));

  framebuffer.setSize(imageIn.value.width, imageIn.value.height);
  framebuffer.bind();
  figment.drawQuad(program, { 
    u_input_texture: imageIn.value.texture, 
    u_resolution: [imageIn.value.width, imageIn.value.height],
    u_line: [x, y, z],
  });
  framebuffer.unbind();
  imageOut.set(framebuffer);

}

imageIn.onChange = render;
pivotXIn.onChange = render;
pivotYIn.onChange = render;
angleIn.onChange = render;
`;

image.modcolor = `// Modulate colors of input image.

const fragmentShader = \`
precision mediump float;
uniform sampler2D u_input_texture;
uniform float u_red;
uniform float u_green;
uniform float u_blue;
varying vec2 v_uv;

void main() {
  vec2 uv = v_uv;
  vec4 col = texture2D(u_input_texture, uv.st);
  col.r += mod(col.r, u_red);
  col.g += mod(col.g, u_green);
  col.b += mod(col.b, u_blue);
  gl_FragColor = col;
}
\`;

const imageIn = node.imageIn('in');
const redIn = node.numberIn('red', 0, { min: 0, max: 1, step: 0.01 });
const greenIn = node.numberIn('green', 0.1, { min: 0, max: 1, step: 0.01 });
const blueIn = node.numberIn('blue', 1, { min: 0, max: 1, step: 0.01 });
const imageOut = node.imageOut('out');

let program, framebuffer;

node.onStart = (props) => {
  program = figment.createShaderProgram(fragmentShader);
  framebuffer = new figment.Framebuffer();
};

function render() {
  if (!imageIn.value) return;
  if (!program) return;
  if (!framebuffer) return;
  framebuffer.setSize(imageIn.value.width, imageIn.value.height);
  framebuffer.bind();
  figment.drawQuad(program, { 
    u_input_texture: imageIn.value.texture,
    u_red: redIn.value,
    u_green: greenIn.value,
    u_blue: blueIn.value,
  });
  framebuffer.unbind();
  imageOut.set(framebuffer);
}

imageIn.onChange = render;
redIn.onChange = render;
greenIn.onChange = render;
blueIn.onChange = render;
`;


image.sharpen  = `// Sharpen an input image

const fragmentShader = \`
precision mediump float;
uniform sampler2D u_input_texture;
varying vec2 v_uv;
uniform float u_step;
//#define STEP .005

#define BOT 1.-u_step
#define TOP 1.+u_step
#define CEN 1

void main() {
  vec2 uv = v_uv;

  gl_FragColor = texture2D( u_input_texture, uv) *2.
  -texture2D(u_input_texture, uv*vec2(BOT, BOT))/8.
  -texture2D(u_input_texture, uv*vec2(CEN, BOT))/8.
  -texture2D(u_input_texture, uv*vec2(TOP, BOT))/8.
  -texture2D(u_input_texture, uv*vec2(BOT, CEN))/8.
  -texture2D(u_input_texture, uv*vec2(TOP, CEN))/8.
  -texture2D(u_input_texture, uv*vec2(BOT, TOP))/8.
  -texture2D(u_input_texture, uv*vec2(CEN, TOP))/8.
  -texture2D(u_input_texture, uv*vec2(TOP, TOP))/8.;
  
}
\`;

const imageIn = node.imageIn('in');
const sharpenIn = node.numberIn('amount', 0.005, { min: 0, max: 0.02, step: 0.001});
const imageOut = node.imageOut('out');

let program, framebuffer;

node.onStart = (props) => {
  program = figment.createShaderProgram(fragmentShader);
  framebuffer = new figment.Framebuffer();
};

function render() {
  if (!imageIn.value) return;
  if (!program) return;
  if (!framebuffer) return;
  framebuffer.setSize(imageIn.value.width, imageIn.value.height);
  framebuffer.bind();
  figment.drawQuad(program, { u_input_texture: imageIn.value.texture,u_step: sharpenIn.value });
  framebuffer.unbind();
  imageOut.set(framebuffer);
}

imageIn.onChange = render;
sharpenIn.onChange = render;
`;


image.sobel = `// Sobel edge detection on input image.

const fragmentShader = \`
precision mediump float;
uniform sampler2D u_input_texture;
uniform vec2 u_resolution;
varying vec2 v_uv;

void make_kernel(inout vec4 n[9], sampler2D tex, vec2 coord)
{
  float w = 1.0 / u_resolution.x;
  float h = 1.0 / u_resolution.y;

  n[0] = texture2D(tex, coord + vec2( -w, -h));
  n[1] = texture2D(tex, coord + vec2(0.0, -h));
  n[2] = texture2D(tex, coord + vec2(  w, -h));
  n[3] = texture2D(tex, coord + vec2( -w, 0.0));
  n[4] = texture2D(tex, coord);
  n[5] = texture2D(tex, coord + vec2(  w, 0.0));
  n[6] = texture2D(tex, coord + vec2( -w, h));
  n[7] = texture2D(tex, coord + vec2(0.0, h));
  n[8] = texture2D(tex, coord + vec2(  w, h));
}

void main() {
  vec2 uv = v_uv;
  vec4 n[9];
  make_kernel(n, u_input_texture, uv.st);

  vec4 sobel_edge_h = n[2] + (2.0*n[5]) + n[8] - (n[0] + (2.0*n[3]) + n[6]);
  vec4 sobel_edge_v = n[0] + (2.0*n[1]) + n[2] - (n[6] + (2.0*n[7]) + n[8]);
  vec4 sobel = sqrt((sobel_edge_h * sobel_edge_h) + (sobel_edge_v * sobel_edge_v));

  gl_FragColor = vec4(1.0 - sobel.rgb, 1.0);
}
\`;

const imageIn = node.imageIn('in');
const imageOut = node.imageOut('out');

let program, framebuffer;

node.onStart = (props) => {
  program = figment.createShaderProgram(fragmentShader);
  framebuffer = new figment.Framebuffer();
};

function render() {
  if (!imageIn.value) return;
  if (!program) return;
  if (!framebuffer) return;
  framebuffer.setSize(imageIn.value.width, imageIn.value.height);
  framebuffer.bind();
  figment.drawQuad(program, { 
    u_input_texture: imageIn.value.texture,
    u_resolution: [imageIn.value.width, imageIn.value.height],
  });
  framebuffer.unbind();
  imageOut.set(framebuffer);
}

imageIn.onChange = render;
`;

image.stitch = `// Combine 2 images.

const fragmentShader = \`
precision mediump float;
uniform sampler2D u_input_texture;
uniform sampler2D u_input_texture2;
varying vec2 v_uv;

void main() {
  vec2 uv = v_uv;
  vec4 color1 = texture2D(u_input_texture, vec2(uv.x*2.0, uv.y));
  vec4 color2 = texture2D(u_input_texture2, vec2(uv.x*2.0-1.0, uv.y));
  gl_FragColor = uv.x < 0.5 ? color1 : color2;
}
\`;

const imageIn = node.imageIn('first');
const imageIn2 = node.imageIn('second');
const imageOut = node.imageOut('out');

let program, framebuffer;

node.onStart = (props) => {
  program = figment.createShaderProgram(fragmentShader);
  framebuffer = new figment.Framebuffer();
};

function render() {
  if (!imageIn.value || !imageIn2.value) return;
  if (!program) return;
  if (!framebuffer) return;
  framebuffer.setSize(imageIn.value.width+imageIn2.value.width, imageIn.value.height);
  framebuffer.bind();
  figment.drawQuad(program, { u_input_texture: imageIn.value.texture,u_input_texture2: imageIn2.value.texture });
  framebuffer.unbind();
  imageOut.set(framebuffer);
}

imageIn.onChange = render;
imageIn2.onChange = render;
`;

image.threshold = `// Change brightness threshold of input image.

const fragmentShader = \`
precision mediump float;
uniform sampler2D u_input_texture;
uniform float u_threshold;
varying vec2 v_uv;

void main() {
  vec2 uv = v_uv;
  vec3 col = texture2D(u_input_texture, uv.st).rgb;
  float brightness = 0.33333 * (col.r + col.g + col.b);
  float b = mix(0.0, 1.0, step(u_threshold, brightness));
  gl_FragColor = vec4(b, b, b, 1.0);
}
\`;

const imageIn = node.imageIn('in');
const thresholdIn = node.numberIn('threshold', 0.5, { min: 0, max: 1, step: 0.01 });
const imageOut = node.imageOut('out');

node.onStart = (props) => {
  program = figment.createShaderProgram(fragmentShader);
  framebuffer = new figment.Framebuffer();
};

function render() {
  if (!imageIn.value) return;
  if (!program) return;
  if (!framebuffer) return;
  framebuffer.setSize(imageIn.value.width, imageIn.value.height);
  framebuffer.bind();
  figment.drawQuad(program, { 
    u_input_texture: imageIn.value.texture, 
    u_threshold: thresholdIn.value,
  });
  framebuffer.unbind();
  imageOut.set(framebuffer);
}

imageIn.onChange = render;
thresholdIn.onChange = render;
`;

ml.classifyImage = `// Classify an image.
// const ml5 = require('ml5');
const imageIn = node.imageIn('image');
const labelOut = node.stringOut('label');
const confidenceOut = node.numberOut('confidence');

const classify = () => {
  if (!imageIn.value) return;
  classifier.classify(imageIn.value, (err, results) => {
    if (err) {
      labelOut.set('');
      confidenceOut.set(0);
    } else {
      const result = results[0];
      labelOut.set(result.label);
      confidenceOut.set(result.confidence);
    }
  });
} 

const classifier = ml5.imageClassifier('MobileNet', classify);
imageIn.onChange = classify;
`;

ml.poseNet = `// Return poses from image.
// const ml5 = require('ml5');
const triggerIn = node.triggerIn('in');
const imageIn = node.imageIn('image');
const typeIn = node.selectIn('detectType', ['single', 'multi']);
const colorIn = node.colorIn('color', [255, 255, 0, 1]);
const poseOut = node.objectOut('poses');
let poseNet;
let poses = [];
let options = {
  imageScaleFactor: 0.9,
  minConfidence: 0.2,
  maxPoseDetections: 4,
  outputStride: 16
}

node.onStart = () => {
  poseNet = ml5.poseNet(modelReady, options);
  poseNet.on('pose', function (results) {
    poses = results;
  });
}

function modelReady() {
  if (typeIn.value == 'single'){
    poseNet.singlePose(imageIn.value);
  } else {
    poseNet.multiPose(imageIn.value);
  }
}

function drawKeypoints(ctx, w, h, s) {
  for (const { pose } of poses) {
    for (const keypoint of pose.keypoints) {
      if (keypoint.score > 0.2) {
        drawPoint(ctx,(keypoint.position.x/imageIn.value.width)*w, (keypoint.position.y/imageIn.value.height)*h,s);
      }
    }
  }
}

function drawSkeleton(ctx, w, h) {
  for (const { skeleton } of poses) {
    for (const [partA, partB] of skeleton) {
      strokeLine(ctx,(partA.position.x/imageIn.value.width)*w, (partA.position.y/imageIn.value.height)*h, (partB.position.x/imageIn.value.width)*w, (partB.position.y/imageIn.value.height)*h)
    }
  }
}

function drawPoint(ctx, x, y, r) {
  ctx.fillStyle = g.rgba(...colorIn.value);
  ctx.beginPath();
  ctx.arc(x, y, r, 0, 2 * Math.PI);
  ctx.fill();
}

function strokeLine(ctx, x1, y1, x2, y2) {
  ctx.strokeStyle = g.rgba(...colorIn.value);
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
}

triggerIn.onTrigger = (props) => {
  const { canvas, ctx } = props;
   if(imageIn.value) {
      poseOut.set(poses);
    };
};

imageIn.onChange = () => {
modelReady()
}

node.debugDraw = (ctx) => {
  ctx.fillStyle = "rgb(100,100,100)";
  ctx.fillRect(0,0,100,75);
  drawKeypoints(ctx, 100, 75, 1);
  drawSkeleton(ctx, 100, 75);
}
`;

ml.poseBodyPart = `// Return position of a body part from pose.
const bodyPartIn = node.selectIn('bodyPart', ['leftAnkle', 'leftEar', 'leftElbow', 'leftEye', 'leftHip', 'leftKnee', 'leftShoulder','leftWrist','nose','rightAnkle', 'rightEar', 'rightElbow', 'rightEye', 'rightHip', 'rightKnee', 'rightShoulder','rightWrist']);
const poseIn = node.objectIn('poses');
const selectPose = node.numberIn('poseIndex', 0, { min: 0 });
const xOut = node.numberOut('x', 0);
const yOut = node.numberOut('y', 0);

function isBodyPart(bp) { 
   return bp.part === bodyPartIn.value;
}

function partOutPoint(){
  if(poseIn.value.length>0){
     const part = poseIn.value[selectPose.value].pose.keypoints.find(isBodyPart);
     let px = part.position.x;
     let py = part.position.y;
     xOut.set(px);
     yOut.set(py);
   }
}
   
bodyPartIn.onChange = partOutPoint;
poseIn.onChange = partOutPoint;
`;

ml.drawSkeleton = `// Draw skeleton from pose.
const triggerIn = node.triggerIn('in');
const colorIn = node.colorIn('color', [255, 255, 0, 1]);
const pointSizeIn = node.numberIn('size', 3);
const poseIn = node.objectIn('poses');

function drawKeypoints(ctx) {
  for (const { pose } of poseIn.value) {
    for (const keypoint of pose.keypoints) {
      if (keypoint.score > 0.2) {
        drawPoint(ctx,keypoint.position.x, keypoint.position.y, pointSizeIn.value);
      }
    }
  }
}

function drawSkeleton(ctx, w, h) {
  for (const { skeleton } of poseIn.value) {
    for (const [partA, partB] of skeleton) {
      strokeLine(ctx,partA.position.x, partA.position.y, partB.position.x, partB.position.y);
    }
  }
}

function drawPoint(ctx, x, y, r) {
  ctx.fillStyle = g.rgba(...colorIn.value);
  ctx.beginPath();
  ctx.arc(x, y, r, 0, 2 * Math.PI);
  ctx.fill();
}

function strokeLine(ctx, x1, y1, x2, y2) {
  ctx.strokeStyle = g.rgba(...colorIn.value);
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
}

triggerIn.onTrigger = (props) => {
  const { canvas, ctx } = props;
   if(poseIn.value) {
      drawKeypoints(ctx);
      drawSkeleton(ctx);
    };
};
`;

ml.teachableMachine = `// Returns prediction of teachable machine model.
// const ml5 = require('ml5');
const imageIn = node.imageIn('image');
const predictOut = node.stringOut('predict');
const urlIn = node.stringIn('url');
let classifier;
let featureExtractor;

urlIn.onChange = () => {
  let imageModelURL = urlIn.value;
  console.log(imageModelURL);
  classifier = ml5.imageClassifier(imageModelURL + 'model.json', modelReady);
}

function modelReady() {
  classifier.classify(imageIn.value, gotResult);
}

function gotResult(error, results) {
  if (error) {
    console.error(error);
    return;
  }
  label = results[0].label;
  predictOut.set(label);
  
}

imageIn.onChange = () => {
   modelReady();
}
`;

ml.faceApi = `// Return faces from face api.
// const ml5 = require('ml5');
const triggerIn = node.triggerIn('in');
const imageIn = node.imageIn('image');
const colorIn = node.colorIn('color', [150, 50, 150, 1]);
let faceapi;
let detections;
let options = {
  withLandmarks: true,
    withDescriptors: false,
 }

node.onStart = () => {
  faceapi = ml5.faceApi(options, modelReady)
}

function gotResults(err, result) {
    if (err) {
        console.log(err)
        return
    }
    detections = result;
}

function drawBox(ctx, detection){
    const alignedRect = detection.alignedRect;
    const {_x, _y, _width, _height} = alignedRect._box;
    ctx.save();
    ctx.strokeStyle = g.rgba(...colorIn.value);
    ctx.strokeRect(_x, _y, _width, _height);
    ctx.restore();
}

function drawLandmarks(ctx, detection){
        const mouth = detection.parts.mouth; 
        const nose = detection.parts.nose;
        const leftEye = detection.parts.leftEye;
        const rightEye = detection.parts.rightEye;
        const rightEyeBrow = detection.parts.rightEyeBrow;
        const leftEyeBrow = detection.parts.leftEyeBrow;
        drawPart(ctx, mouth, true);
        drawPart(ctx, nose, false);
        drawPart(ctx, leftEye, true);
        drawPart(ctx, leftEyeBrow, false);
        drawPart(ctx, rightEye, true);
        drawPart(ctx, rightEyeBrow, false);
}

function drawPart(ctx, feature, closed){
  ctx.strokeStyle = g.rgba(...colorIn.value);
  ctx.beginPath();
  for(let i = 0; i < feature.length; i++){
     const x = feature[i]._x
     const y = feature[i]._y
     ctx.lineTo(x, y);
  }
  ctx.stroke();  
}
        
function modelReady() {
  faceapi.detect(imageIn.value, gotResults)
}
        
triggerIn.onTrigger = (props) => {
   const { canvas, ctx } = props;
      if (detections) {
        for(let i = 0; i < detections.length;i++){
        drawBox(ctx, detections[i])
        drawLandmarks(ctx, detections[i])
        }
    }
};

imageIn.onChange = () => {
   faceapi.detect(imageIn.value, gotResults)
}

colorIn.onChange = () => {
   faceapi.detect(imageIn.value, gotResults)
}
`;

export default { core, math, graphics, image, ml };
