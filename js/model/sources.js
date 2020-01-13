export const sourceCanvas = `
// Initialize a new canvas and triggers the render every frame.
const triggerOut = node.triggerOut('out');

node.onStart = (props) => {
  const canvas = document.createElement('canvas');
  node._canvas = canvas;
  canvas.width = 400;
  canvas.height = 400;
  const viewer = document.getElementById('viewer');
  viewer.innerHTML = '';
  viewer.appendChild(canvas);
  const ctx = canvas.getContext('2d');
  node._ctx = ctx;
  triggerOut.trigger({ canvas, ctx });
};

node.onFrame = () => {
  const canvas = node._canvas;
  const ctx = node._ctx;
  triggerOut.trigger({ canvas, ctx });
};
`;

export const sourceBackgroundColor = `
// Fill the entire canvas with the background color.
const triggerIn = node.triggerIn('in');
const triggerOut = node.triggerOut('out');
const inColor = node.inColor('color', [20, 20, 30, 1]);

triggerIn.onTrigger = (props) => {
  const { canvas, ctx } = props;
  ctx.fillStyle = g.rgbToHex(...inColor.value);
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  triggerOut.trigger(props);
};
`;

export const sourceSequence = `
// Execute the connected nodes in the correct order. 
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

export const sourceRect = `
// Draw a rectangle on the canvas.
const triggerIn = node.triggerIn('in');
const triggerOut = node.triggerOut('out');
const inColor = node.inColor('color', [150, 50, 150, 1]);
const inPosition = node.inPoint('position', new g.Point(100, 100));
const inRadius = node.inFloat('radius', 50, { min: 0, max: 1000 });

triggerIn.onTrigger = (props) => {
  const { canvas, ctx } = props;
  const pos = inPosition.value;
  const r = inRadius.value;
  ctx.save();
  ctx.fillStyle = \`rgba(\${inColor.value.join(',')})\`;
  ctx.translate(pos.x, pos.y);
  ctx.fillRect(-r, -r, r * 2, r * 2);
  ctx.restore();
};
`;
