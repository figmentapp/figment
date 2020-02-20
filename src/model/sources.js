export const core = {};
export const math = {};
export const graphics = {};
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

core.animate = `// Animate a value over time.
const tween = require('tween-functions');
const easings = Object.keys(tween);

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
  if (drawBackgroundIn.value) {
    ctx.fillStyle = g.rgba(...backgroundColorIn.value);
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }
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

image.loadImage = `// Load an image from a file.
const url = require('url');

const fileIn = node.fileIn('file', '');
const imageOut = node.imageOut('image');

function exec() {
  if (!fileIn.value || fileIn.value.trim().length === 0) return;
  const imageUrl = figment.urlForAsset(fileIn.value);
  const image = new Image();
  function onFinished(e) {
    const supported = e.type === 'load' && image.width > 0;
    if (supported) {
      imageOut.set(image);
    } else {
      imageOut.set(null);
    }
  }
  image.onerror = onFinished;
  image.onload = onFinished;
  image.src = imageUrl;
}

node.onStart = exec;
fileIn.onChange = exec;
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
          video: true
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

ml.classifyImage = `// Classify an image.
const ml5 = require('ml5');
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

export default { core, math, graphics, image, ml };
