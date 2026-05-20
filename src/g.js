//const TWO_PI = Math.PI * 2;
const RADIANS = Math.PI / 180;
const DEGREES = 180 / Math.PI;

export class Point {
  constructor(x, y) {
    this.x = x;
    this.y = y;
  }

  clone() {
    return new Point(this.x, this.y);
  }
}

export const rgbToHex = (r, g, b) =>
  '#' +
  [r, g, b]
    .map((x) => {
      const hex = x.toString(16);
      return hex.length === 1 ? '0' + hex : hex;
    })
    .join('');

export const rgba = (r, g, b, a) => `rgba(${r}, ${g}, ${b}, ${a})`;

export const toRadians = (v) => v * RADIANS;
export const toDegrees = (v) => v * DEGREES;

// Fit a contentW×contentH rectangle inside a boxW×boxH frame, preserving aspect.
// Returns the uniform scale + the centered rect (offset + scaled dimensions).
export function computeAspectFit(boxW, boxH, contentW, contentH) {
  const scale = Math.min(boxW / contentW, boxH / contentH);
  const width = contentW * scale;
  const height = contentH * scale;
  return {
    scale,
    width,
    height,
    offsetX: (boxW - width) / 2,
    offsetY: (boxH - height) / 2,
  };
}
