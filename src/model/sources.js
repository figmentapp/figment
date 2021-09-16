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
// const url = require('url');

const fileIn = node.fileIn('file', '');
const imageOut = node.imageOut('out');

let texture, target, mesh, camera;

node.onStart = () => {
  camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
}

function loadImage() {
  if (!fileIn.value || fileIn.value.trim().length === 0) return;
  const imageUrl = figment.urlForAsset(fileIn.value);
  console.log('loadImage', imageUrl.toString());
  const textureLoader = new THREE.TextureLoader();
  const out = textureLoader.load(imageUrl.toString(), onLoad, null, onError);
}

function onLoad(texture) {
  const geometry = new THREE.PlaneGeometry(2, 2);
  const material = new THREE.MeshBasicMaterial({ map: texture });
  mesh = new THREE.Mesh(geometry, material);
  target = new THREE.WebGLRenderTarget(texture.image.width, texture.image.height, { depthBuffer: false });

  gRenderer.setRenderTarget(target);
  gRenderer.render(mesh, camera);
  gRenderer.setRenderTarget(null);

  imageOut.set(target);
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

image.camImage = `// webcam stream
const frameRate = node.numberIn('frameRate', 10);
const imageOut = node.imageOut('image');
let _video;
let _stream;
let _timer;

node.onStart = () => {
  
if (navigator.mediaDevices.getUserMedia) {
      navigator.mediaDevices.getUserMedia({
          video: true,
          audio: false
        })
        .then(function(stream) {
          _video = document.createElement('video');
          _video.width = 640;
          _video.height = 480;
          _video.srcObject = stream;
          _video.play();
          _stream = stream;
          imageOut.set(_video);
          _timer = setInterval(() => imageOut.set(_video), 1000 / frameRate.value);
        })
        .catch(function(err) {
          console.error("no camera input!", err);
        });
    }
};

node.onStop = () => {
  clearInterval(_timer);
  if (_stream.active) {
    _stream.getTracks().forEach(track => track.stop())
    _video = null;
  }
}

frameRate.onChange = () => {
  clearInterval(_timer);
  _timer = setInterval(() => imageOut.set(_video), 1000 / frameRate.value);
}

node.debugDraw = (ctx) => {
  if (imageOut.value) {
    ctx.drawImage(imageOut.value, 0, 0, 100, 75);
  }
}
`;

image.pixels = `// pixels from image
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

image.constant = `// Render a constant color.

const fragmentShader = \`
precision mediump float;
uniform vec3 uColor; // R/G/B color
uniform float uAlpha;
varying vec2 vUv;
void main() {
  gl_FragColor = vec4(uColor, uAlpha);
}
\`;

const colorIn = node.colorIn('color');
const alphaIn = node.numberIn('alpha', 1.0, { min: 0, max: 1, step: 0.01});
const widthIn = node.numberIn('width', 1024, { min: 1, max: 4096, step: 1 });
const heightIn = node.numberIn('height', 512, { min: 1, max: 4096, step: 1 });
const imageOut = node.imageOut('out');

let camera, material, mesh, target;

node.onStart = (props) => {
  camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  material = figment.createShaderMaterial(fragmentShader, { 
    uColor: { value: [1.0, 0.0, 0.0] },
    uAlpha: { value: 1 },
  });
  const geometry = new THREE.PlaneGeometry(2, 2);
  mesh = new THREE.Mesh(geometry, material);
  target = new THREE.WebGLRenderTarget(widthIn.value, heightIn.value, { depthBuffer: false });  
};

function render() {
  target.setSize(widthIn.value, heightIn.value);
  material.uniforms.uColor.value = [colorIn.value[0] / 255, colorIn.value[1] / 255, colorIn.value[2] / 255];
  material.uniforms.uAlpha.value = alphaIn.value;
  gRenderer.setRenderTarget(target);
  gRenderer.render(mesh, camera);
  gRenderer.setRenderTarget(null);
  imageOut.set(target);
}

colorIn.onChange = render;
alphaIn.onChange = render;
widthIn.onChange = render;
heightIn.onChange = render;
`;

image.greyscale = `// grayscale conversion of input image.

const fragmentShader = \`
precision mediump float;
uniform sampler2D uInputTexture;
varying vec2 vUv;

void main() {
  vec2 uv = vUv;
  vec4 color = texture2D(uInputTexture, uv.st);
	float gray = dot(color.rgb, vec3(0.299, 0.587, 0.114));
	gl_FragColor = vec4(vec3(gray), 1.0);
}
\`;

const imageIn = node.imageIn('in');
const imageOut = node.imageOut('out');

let camera, material, mesh, target;

node.onStart = (props) => {
  camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  material = figment.createShaderMaterial(fragmentShader, { uInputTexture: { value:  null },});
  const geometry = new THREE.PlaneGeometry(2, 2);
  mesh = new THREE.Mesh(geometry, material);
  target = new THREE.WebGLRenderTarget(1, 1, { depthBuffer: false });  
};

function render() {
  if (!imageIn.value) return;
  target.setSize(imageIn.value.width, imageIn.value.height);
  material.uniforms.uInputTexture.value = imageIn.value.texture;
  gRenderer.setRenderTarget(target);
  gRenderer.render(mesh, camera);
  gRenderer.setRenderTarget(null);
  imageOut.set(target);
}

imageIn.onChange = render;
`;

image.invert = `// Invert colors of input image.

const fragmentShader = \`
precision mediump float;
uniform sampler2D uInputTexture;
varying vec2 vUv;
void main() {
  vec2 uv = vUv;
  gl_FragColor = texture2D(uInputTexture, uv.xy);
  gl_FragColor.rgb = 1.0 - gl_FragColor.rgb;
}
\`;

const imageIn = node.imageIn('in');
const imageOut = node.imageOut('out');

let camera, material, mesh, target;

node.onStart = (props) => {
  camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  material = figment.createShaderMaterial(fragmentShader, { uInputTexture: { value:  null }});
  const geometry = new THREE.PlaneGeometry(2, 2);
  mesh = new THREE.Mesh(geometry, material);
  target = new THREE.WebGLRenderTarget(1, 1, { depthBuffer: false });  
};

function render() {
  if (!imageIn.value) return;
  target.setSize(imageIn.value.width, imageIn.value.height);
  material.uniforms.uInputTexture.value = imageIn.value.texture;
  gRenderer.setRenderTarget(target);
  gRenderer.render(mesh, camera);
  gRenderer.setRenderTarget(null);
  imageOut.set(target);
}

imageIn.onChange = render;
`;

image.mirror = `// Mirror the input image over a specific axis.

const fragmentShader = \`
precision mediump float;
uniform sampler2D uInputTexture;
uniform bool uHor, uRev;
varying vec2 vUv;
void main() {
  vec2 uv = vUv;
  if(uHor && uRev){
    if(uv.y > 0.5){
      uv.y = 0.5 - (uv.y - 0.5);
    }
  }
  if(uHor && !uRev){
    if(uv.y < 0.5){
      uv.y = 0.5 - uv.y;
    }else{
      uv.y -= 0.5; 
    }
  }
  if(!uHor && !uRev){
    if(uv.x > 0.5){
      uv.x = 0.5 - (uv.x - 0.5);
    }
  }
  if(!uHor && uRev){
    if(uv.x < 0.5){
      uv.x = 0.5 - uv.x;
    }else{
      uv.x -= 0.5; 
    }
  }
  vec4 originalColor = texture2D(uInputTexture, uv);
  gl_FragColor = originalColor;
}
\`;

const imageIn = node.imageIn('in');
const directionIn = node.toggleIn('horizontal', true);
const reverseIn = node.toggleIn('reverse', true);
const imageOut = node.imageOut('out');

let camera, material, mesh, target;

node.onStart = (props) => {
  camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  material = figment.createShaderMaterial(fragmentShader, {
    uInputTexture: { value: null },
    uHor: { value: true },
    uRev: { value: false },
  })
  const geometry = new THREE.PlaneGeometry(2, 2);
  mesh = new THREE.Mesh(geometry, material);
  target = new THREE.WebGLRenderTarget(1, 1, { depthBuffer: false });  
};

function render() {
  if (!imageIn.value) return;
  target.setSize(imageIn.value.width, imageIn.value.height);
  material.uniforms.uInputTexture.value = imageIn.value.texture;
  material.uniforms.uHor.value = directionIn.value;
  material.uniforms.uRev.value = reverseIn.value;
  gRenderer.setRenderTarget(target);
  gRenderer.render(mesh, camera);
  gRenderer.setRenderTarget(null);
  imageOut.set(target);
}

imageIn.onChange = render;
directionIn.onChange = render;
reverseIn.onChange = render;
`;

image.sobel = `// Sobel edge detection on input image.

const fragmentShader = \`
precision mediump float;
uniform sampler2D uInputTexture;
uniform float uWidth;
uniform float uHeight;
varying vec2 vUv;

void make_kernel(inout vec4 n[9], sampler2D tex, vec2 coord)
{
	float w = 1.0 / uWidth;
	float h = 1.0 / uHeight;

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
  vec2 uv = vUv;
	vec4 n[9];
	make_kernel( n, uInputTexture, uv.st );

	vec4 sobel_edge_h = n[2] + (2.0*n[5]) + n[8] - (n[0] + (2.0*n[3]) + n[6]);
  vec4 sobel_edge_v = n[0] + (2.0*n[1]) + n[2] - (n[6] + (2.0*n[7]) + n[8]);
	vec4 sobel = sqrt((sobel_edge_h * sobel_edge_h) + (sobel_edge_v * sobel_edge_v));

	gl_FragColor = vec4( 1.0 - sobel.rgb, 1.0 );
}
\`;

const imageIn = node.imageIn('in');
const imageOut = node.imageOut('out');

let camera, material, mesh, target;

node.onStart = (props) => {
  camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  material = figment.createShaderMaterial(fragmentShader, {
    uInputTexture: { value:  null },
    uWidth: { value: 1 },
    uHeight: { value: 1 },
  });
  const geometry = new THREE.PlaneGeometry(2, 2);
  mesh = new THREE.Mesh(geometry, material);
  target = new THREE.WebGLRenderTarget(1, 1, { depthBuffer: false });  
};

function render() {
  if (!imageIn.value) return;
  target.setSize(imageIn.value.width, imageIn.value.height);
  material.uniforms.uInputTexture.value = imageIn.value.texture;
  material.uniforms.uWidth.value = imageIn.value.width;
  material.uniforms.uHeight.value = imageIn.value.height;
  gRenderer.setRenderTarget(target);
  gRenderer.render(mesh, camera);
  gRenderer.setRenderTarget(null);
  imageOut.set(target);
}

imageIn.onChange = render;
`;

image.threshold = `// brightness threshold between 0 - 1.

const fragmentShader = \`
precision mediump float;
uniform sampler2D uInputTexture;
uniform float uThreshold;
varying vec2 vUv;

void main() {
  vec2 uv = vUv;
  vec3 col = texture2D(uInputTexture, uv.st).rgb;
  float bright = 0.33333 * (col.r + col.g + col.b);
  float b = mix(0.0, 1.0, step(uThreshold, bright));
  gl_FragColor = vec4(vec3(b), 1.0);
}
\`;

const imageIn = node.imageIn('in');
const thresholdIn = node.numberIn('threshold', 0.5, { min: 0, max: 1, step: 0.011 });

const imageOut = node.imageOut('out');

let camera, material, mesh, target;

node.onStart = (props) => {
  camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  material = figment.createShaderMaterial(fragmentShader, { uInputTexture: { value:  null },
    uThreshold: { value: 0 },});
  const geometry = new THREE.PlaneGeometry(2, 2);
  mesh = new THREE.Mesh(geometry, material);
  target = new THREE.WebGLRenderTarget(1, 1, { depthBuffer: false });  
};

function render() {
  if (!imageIn.value) return;
  target.setSize(imageIn.value.width, imageIn.value.height);
  material.uniforms.uInputTexture.value = imageIn.value.texture;
  material.uniforms.uThreshold.value = thresholdIn.value;
  gRenderer.setRenderTarget(target);
  gRenderer.render(mesh, camera);
  gRenderer.setRenderTarget(null);
  imageOut.set(target);
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

ml.poseNet = `// return poses from image.
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

ml.poseBodyPart = `// return position of a body part from pose.
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

ml.drawSkeleton = `// draw skeleton from pose.
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

ml.teachableMachine = `// returns prediction of teachable machine model.
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

ml.faceApi = `// return faces from face api.
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
