export const core = {};
export const graphics = {};
export const image = {};

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
const triggerIn = node.triggerIn('in');
const frameOut = node.numberOut('frame', 0);
const secondsOut = node.numberOut('seconds', 0);

node.onStart = (props) => {
  node._frame = 0;
  node._startTime = Date.now();
}

triggerIn.onTrigger = (props) => {
  node._frame++;
  frameOut.set(node._frame);
  secondsOut.set((Date.now() - node._startTime) / 1000);
}
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

function onMouseMove(e) {
  xOut.set(e.offsetX);
  yOut.set(e.offsetY);
}

node.onStart = (props) => {
  let viewer = document.getElementById('viewer');
  let canvas = viewer.querySelector('canvas');
  if (!canvas) canvas = viewer;
  canvas.addEventListener('mousemove', onMouseMove);
}

node.onStop = (props) => {
  let viewer = document.getElementById('viewer');
  let canvas = viewer.querySelector('canvas');
  if (!canvas) canvas = viewer;
  canvas.removeEventListener('mousemove', onMouseMove);
};
`;

graphics.canvas = `// Initialize a new canvas and triggers the render every frame.
const playingIn = node.toggleIn('playing', true);
const widthIn = node.numberIn('width', 500);
const heightIn = node.numberIn('height', 500);
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
  triggerOut.trigger({ canvas, ctx });
}

function doFrame() {
  const canvas = node._canvas;
  const ctx = node._ctx;
  triggerOut.trigger({ canvas, ctx });
  if (playingIn.value) {
    window.requestAnimationFrame(node.onFrame);
  }
}

node.onStart = resize;
widthIn.onChange = resize;
heightIn.onChange = resize;
node.onFrame = doFrame;
playingIn.onChange = doFrame;
`;

graphics.backgroundColor = `// Fill the entire canvas with the background color.
const triggerIn = node.triggerIn('in');
const triggerOut = node.triggerOut('out');
const colorIn = node.colorIn('color', [20, 20, 30, 1]);

triggerIn.onTrigger = (props) => {
  const { canvas, ctx } = props;
  ctx.fillStyle = g.rgba(...colorIn.value);
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  triggerOut.trigger(props);
};
`;

graphics.clone = `// Clone and transform the shapes.
const triggerIn = node.triggerIn('in');
const amount = node.numberIn('amount', 5);
const translateX = node.numberIn('translateX', 20);
const translateY = node.numberIn('translateY', 20);
const triggerOut = node.triggerOut('out');

triggerIn.onTrigger = (props) => {
  const { ctx } = props;
  ctx.save();
  for (let i = 0; i < amount.value; i++) {
    triggerOut.trigger(props);
    ctx.translate(translateX.value, translateY.value);
  }
  ctx.restore();
};
`;

graphics.rect = `// Draw a rectangle on the canvas.
const triggerIn = node.triggerIn('in');
const triggerOut = node.triggerOut('out');
const xIn = node.numberIn('x', 100);
const yIn = node.numberIn('y', 100);
const colorIn = node.colorIn('color', [150, 50, 150, 1]);
const radiusIn = node.numberIn('radius', 50, { min: 0, max: 1000 });

triggerIn.onTrigger = (props) => {
  const { canvas, ctx } = props;
  const r = radiusIn.value;
  ctx.save();
  ctx.fillStyle = g.rgba(...colorIn.value);
  ctx.translate(xIn.value, yIn.value);
  ctx.fillRect(-r, -r, r * 2, r * 2);
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
const colorIn = node.colorIn('color', [150, 50, 150, 1]);
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
}
`;

image.loadImage = `// Load an image from a file.
const url = require('url');

const fileIn = node.fileIn('file', '');
const imageOut = node.imageOut('image');

function exec() {
  if (!fileIn.value || fileIn.value.trim().length === 0) return;
  const imageUrl = url.pathToFileURL(fileIn.value);
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
const imageIn = node.imageIn('image');
const xIn = node.numberIn('x');
const yIn = node.numberIn('y');
const centeredIn = node.toggleIn('centered', false);

triggerIn.onTrigger = (props) => {
  const { canvas, ctx } = props;
  if (imageIn.value) {
    if (centeredIn.value) {
      ctx.drawImage(imageIn.value, xIn.value - imageIn.value.width / 2, yIn.value - imageIn.value.height / 2);
    } else {
      ctx.drawImage(imageIn.value, xIn.value, yIn.value);
    }
  }
};
`;

image.camImage = `// webcam stream
const imageOut = node.imageOut('image');
let video;
let streaming;

node.onStart = () => {
    video = document.createElement('video');
    video.autoplay = true;
  
 if (navigator.mediaDevices.getUserMedia) {
      navigator.mediaDevices.getUserMedia({
          video: true
        })
        .then(function(stream) {
          video.srcObject = stream;
          streaming = stream;
          imageOut.set(video);
        })
        .catch(function(err0r) {
          console.log("no camera input!");
        });
    }
};

node.onStop = () => {
  if (streaming.active) {
    streaming.getTracks().forEach(track => track.stop())
    video = null;
  }
}
`;

export default { core, graphics, image };
