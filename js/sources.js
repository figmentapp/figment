export const sourceCanvas = `
const triggerOut = node.triggerOut('out');
node.onStart = (props) => {
  console.log('STARTING DA NODE.');
   const canvas = document.createElement('canvas');
   canvas.width = 400;
   canvas.height = 400;
   const viewer = document.getElementById('viewer');
   viewer.innerHTML = '';
   viewer.appendChild(canvas);
   const ctx = canvas.getContext('2d');
   triggerOut.trigger({ canvas, ctx });
};
`;

export const sourceBackgroundColor = `
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

export const sourceRect = `
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
  ctx.fillStyle = g.rgbToHex(...inColor.value);
  ctx.translate(pos.x, pos.y);
  ctx.fillRect(-r, -r, r * 2, r * 2);
  ctx.restore();
};
`;
