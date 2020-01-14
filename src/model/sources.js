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
const widthIn = node.numberIn('width', 500);
const heightIn = node.numberIn('height', 500);
const triggerOut = node.triggerOut('out');

function resize() {
  const canvas = document.createElement('canvas');
  node._canvas = canvas;
  canvas.width = widthIn.value;
  canvas.height = heightIn.value;
  const viewer = document.getElementById('viewer');
  viewer.innerHTML = '';
  viewer.appendChild(canvas);
  const ctx = canvas.getContext('2d');
  node._ctx = ctx;
  triggerOut.trigger({ canvas, ctx });
}

node.onStart = resize;
widthIn.onChange = resize;
heightIn.onChange = resize;

node.onFrame = () => {
  const canvas = node._canvas;
  const ctx = node._ctx;
  triggerOut.trigger({ canvas, ctx });
  window.requestAnimationFrame(node.onFrame);
};
`;

graphics.backgroundColor = `// Fill the entire canvas with the background color.
const triggerIn = node.triggerIn('in');
const triggerOut = node.triggerOut('out');
const colorIn = node.colorIn('color', [20, 20, 30, 1]);

triggerIn.onTrigger = (props) => {
  const { canvas, ctx } = props;
  ctx.fillStyle = g.rgbToHex(...colorIn.value);
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  triggerOut.trigger(props);
};
`;

graphics.clone = `// Clone and transform the shapes.
const triggerIn = node.triggerIn('in');
const amount = node.numberIn('amount', 5);
const translateIn = node.pointIn('translate', new g.Point(20, 20));
const triggerOut = node.triggerOut('out');

triggerIn.onTrigger = (props) => {
  const { ctx } = props;
  ctx.save();
  for (let i = 0; i < amount.value; i++) {
    triggerOut.trigger(props);
    ctx.translate(translateIn.value.x, translateIn.value.y);
  }
  ctx.restore();
};
`;

graphics.rect = `// Draw a rectangle on the canvas.
const triggerIn = node.triggerIn('in');
const triggerOut = node.triggerOut('out');
const colorIn = node.colorIn('color', [150, 50, 150, 1]);
const positionIn = node.pointIn('position', new g.Point(100, 100));
const radiusIn = node.numberIn('radius', 50, { min: 0, max: 1000 });

triggerIn.onTrigger = (props) => {
  const { canvas, ctx } = props;
  const pos = positionIn.value;
  const r = radiusIn.value;
  ctx.save();
  ctx.fillStyle = \`rgba(\${colorIn.value.join(',')})\`;
  ctx.translate(pos.x, pos.y);
  ctx.fillRect(-r, -r, r * 2, r * 2);
  ctx.restore();
};
`;

export default { core, graphics };
