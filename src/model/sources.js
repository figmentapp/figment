export const core = {};
export const graphics = {};

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
const translateX = node.pointIn('translateX', 20);
const translateY = node.pointIn('translateY', 20);
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
};
`;

export default { core, graphics };
