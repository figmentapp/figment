export class Color {
  constructor(r = 0, g = 0, b = 0, a = 1) {
    this.r = r;
    this.g = g;
    this.b = b;
    this.a = a;
  }

  equals(other) {
    if (!other) return false;
    return this.r === other.r && this.g === other.g && this.b === other.b && this.a === other.a;
  }

  get visible() {
    return this.a > 0;
  }

  toRgba() {
    return `rgba(${this.r * 255}, ${this.g * 255}, ${this.b * 255}, ${this.a})`;
  }
  setFillStyle(ctx) {
    ctx.fillStyle = this.toRgba();
  }
  setStrokeStyle(ctx) {
    ctx.strokeStyle = this.toRgba();
  }
  clone() {
    return new Color(this.r, this.g, this.b, this.a);
  }
}

export class LinearGradient {
  constructor(r1 = 0, g1 = 0, b1 = 0, a1 = 1, r2 = 1, g2 = 1, b2 = 1, a2 = 1) {
    this.r1 = r1;
    this.g1 = g1;
    this.b1 = b1;
    this.a1 = a1;
    this.r2 = r2;
    this.g2 = g2;
    this.b2 = b2;
    this.a2 = a2;
  }

  get visible() {
    return true;
  }

  createGradient(ctx) {
    const gradient = ctx.createLinearGradient(0, 0, 0, 500);
    const clr1 = `rgba(${this.r1 * 255}, ${this.g1 * 255}, ${this.b1 * 255}, ${this.a1})`;
    const clr2 = `rgba(${this.r2 * 255}, ${this.g2 * 255}, ${this.b2 * 255}, ${this.a2})`;
    gradient.addColorStop(0, clr1);
    gradient.addColorStop(1, clr2);
    return gradient;
  }
  setFillStyle(ctx) {
    ctx.fillStyle = this.createGradient(ctx);
  }
  setStrokeStyle(ctx) {
    ctx.strokeStyle = this.createGradient(ctx);
  }
  clone() {
    return new LinearGradient(this.r1, this.g1, this.b1, this.a1, this.r2, this.g2, this.b2, this.a2);
  }
}

export class Style {
  constructor(fill, stroke, strokeWidth = 1) {
    this.fill = fill ? fill.clone() : null;
    this.stroke = stroke ? stroke.clone() : null;
    this.strokeWidth = strokeWidth;
  }

  clone() {
    const newStyle = new Style(this.fill, this.stroke, this.strokeWidth);
    return newStyle;
  }

  equals(other) {
    return (
      ((!this.fill && !other.fill) || this.fill.equals(other.fill)) &&
      ((!this.stroke && !other.stroke) || this.stroke.equals(other.stroke)) &&
      this.strokeWidth === other.strokeWidth
    );
  }

  draw(ctx) {
    if (this.fill && this.fill.visible) {
      this.fill.setFillStyle(ctx);
      ctx.fill();
    }
    if (this.stroke && this.stroke.a > 0) {
      this.stroke.setStrokeStyle(ctx);
      ctx.lineWidth = this.strokeWidth;
      ctx.stroke();
    }
  }
}
