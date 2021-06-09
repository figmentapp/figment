export class Shape {
  constructor(initialCapacity = 32) {
    this.contours = new AttributeTable(8);
    this.contours.addAttributeType('offset', ATTRIBUTE_TYPE_I16);
    this.contours.addAttributeType('closed', ATTRIBUTE_TYPE_U8);
    this.contours.addAttributeType('style', ATTRIBUTE_TYPE_I16);

    this.commands = new AttributeTable(initialCapacity);
    this.commands.addAttributeType('verb', ATTRIBUTE_TYPE_U8);
    this.commands.addAttributeType('p[x]', ATTRIBUTE_TYPE_F32);
    this.commands.addAttributeType('p[y]', ATTRIBUTE_TYPE_F32);

    this.styles = [];
    this.currentStyleIndex = -1;
  }

  clone() {
    const newGeo = new Shape();
    newGeo.contours = this.contours.clone();
    newGeo.commands = this.commands.clone();
    newGeo.styles = this.styles.map(style => style.clone());
    newGeo.currentStyleIndex = this.currentStyleIndex;
    return newGeo;
  }

  extend(geo) {
    // Each contour has a style index, so we'll store the current offset.
    const styleOffset = this.styles.length;

    // Extend contours
    const contoursSize = geo.contours.size;
    const offset = geo.contours.getArray('offset');
    const closed = geo.contours.getArray('closed');
    const style = geo.contours.getArray('style');
    for (let i = 0; i < contoursSize; i++) {
      const newContour = { offset: offset[i] + this.commands.size, closed: closed[i], style: style[i] + styleOffset };
      this.contours.append(newContour);
    }

    // Extend commands
    const commandsSize = geo.commands.size;
    for (let i = 0; i < commandsSize; i++) {
      const newCommand = geo.commands.getObject(i);
      this.commands.append(newCommand);
    }

    // Extends styles
    for (const style of geo.styles) {
      this.styles.push(style.clone());
    }
    this.currentStyleIndex = this.styles.length - 1;
  }

  mapPoints(fn) {
    const size = this.commands.size;
    const xs = this.commands.getArray('p[x]');
    const ys = this.commands.getArray('p[y]');
    for (let i = 0; i < size; i++) {
      const [x, y] = fn(xs[i], ys[i], i, size);
      xs[i] = x;
      ys[i] = y;
    }
  }

  moveTo(x, y) {
    // this.contours.increaseCapacity(1);
    const offset = this.commands.size;
    if (this.styles.length === 0) {
      // Add a default path style.
      this.styles.push(new Style(new Color(0, 0, 0, 1), new Color(0, 0, 0, 0), 1));
      this.currentStyleIndex = 0;
    }
    this.contours.append({ offset, closed: 0, style: this.currentStyleIndex });
    this.commands.append({ verb: PATH_MOVE_TO, 'p[x]': x, 'p[y]': y });
  }

  lineTo(x, y) {
    this.commands.append({ verb: PATH_LINE_TO, 'p[x]': x, 'p[y]': y });
  }

  curveTo(cx1, cy1, cx2, cy2, x, y) {
    this.commands.append({ verb: PATH_CURVE_TO, 'p[x]': x, 'p[y]': y });
    this.commands.append({ verb: PATH_CTRL, 'p[x]': cx1, 'p[y]': cy1 });
    this.commands.append({ verb: PATH_CTRL, 'p[x]': cx2, 'p[y]': cy2 });
  }

  close() {
    console.assert(this.contours.size > 0, `Close command called but there is no current path.`);
    this.contours.set(this.contours.size - 1, { closed: 1 });
  }

  addRect(x, y, w, h) {
    this.moveTo(x, y);
    this.lineTo(x + w, y);
    this.lineTo(x + w, y + h);
    this.lineTo(x, y + h);
    this.close();
  }

  addStyle(style) {
    this.styles.push(style);
    this.currentStyleIndex = this.styles.length - 1;
  }

  draw(ctx) {
    const { contours, commands, styles } = this;
    if (contours.size > 0) {
      this._drawShapes(ctx, contours, commands, styles);
    } else if (commands.size > 0) {
      this._drawPoints(ctx, commands);
    }
  }

  _drawShapes(ctx, contours, commands, styles) {
    ctx.beginPath();
    for (let i = 0; i < contours.size; i++) {
      const offset = contours.get(i, 'offset');
      const closed = contours.get(i, 'closed');
      const style = contours.get(i, 'style');
      const nextOffset = i < contours.size - 1 ? contours.get(i + 1, 'offset') : commands.size;
      for (let j = offset; j < nextOffset; j++) {
        const verb = commands.get(j, 'verb');
        if (verb === PATH_MOVE_TO) {
          const x = commands.get(j, 'p[x]');
          const y = commands.get(j, 'p[y]');
          ctx.beginPath(); // perf hack
          ctx.moveTo(x, y);
        } else if (verb === PATH_LINE_TO) {
          const x = commands.get(j, 'p[x]');
          const y = commands.get(j, 'p[y]');
          ctx.lineTo(x, y);
        } else if (verb === PATH_CURVE_TO) {
          const x = commands.get(j, 'p[x]');
          const y = commands.get(j, 'p[y]');
          const cx1 = commands.get(j + 1, 'p[x]');
          const cy1 = commands.get(j + 1, 'p[y]');
          const cx2 = commands.get(j + 2, 'p[x]');
          const cy2 = commands.get(j + 2, 'p[y]');
          ctx.bezierCurveTo(cx1, cy1, cx2, cy2, x, y);
        }
      }
      if (!!closed) {
        ctx.closePath();
      }
      const drawStyle = styles[style];
      if (!drawStyle) {
        throw new Error(`Style ${style} not found in styles.`);
      }
      drawStyle.draw(ctx);
    }
  }

  _drawPoints(ctx, commands) {
    ctx.fillStyle = `#ddd`;
    ctx.beginPath();
    const pointCount = commands.size;
    const xs = commands.table['p[x]'].data;
    const ys = commands.table['p[y]'].data;
    let deads;
    if (commands.hasAttribute('dead')) {
      deads = commands.table['dead'].data;
    }
    for (let i = 0; i < pointCount; i++) {
      if (deads && deads[i]) continue;
      ctx.moveTo(xs[i], ys[i]);
      ctx.arc(xs[i], ys[i], 2, 0, Math.PI * 2);
    }
    ctx.fill();
  }
}
