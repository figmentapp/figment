// Landmark overlays (points and connector lines) for the Detect Pose /
// Hands / Faces and Receive Rokoko nodes, drawn straight into a
// RenderTarget.
//
// The canvas path this replaces (MediaPipe's DrawingUtils on an
// OffscreenCanvas, then copyExternalImageToTexture) uploaded a full frame
// per render (8 MB at 1080p). Here the node describes what to draw as a
// list of primitives — a few KB — and one instanced draw call rasterizes
// them with an analytic signed-distance function per primitive, so nothing
// crosses the CPU/GPU boundary except that list.
//
// Every primitive is a segment p0→p1 of half-width r: a landmark point is a
// zero-length segment with round caps, a connector has butt caps like the
// canvas 2D default. DrawingUtils semantics are kept: normalized landmark
// coordinates scale to the target size, `lineWidth` defaults to 4 and
// `radius` to 6, and a point is a filled circle plus a stroke of the same
// color, so its visible radius is radius + lineWidth / 2.

import { getDevice, getQueue, colorToVec4 } from './figment';

const FLOATS_PER_INSTANCE = 12; // p0.xy, p1.xy, radius, round, pad.xy, color.rgba (48 bytes, vec4f-aligned)
const DEFAULT_LINE_WIDTH = 4;
const DEFAULT_RADIUS = 6;

// Connections come as [start, end] pairs (src/landmark-connections.js) or
// as { start, end } objects (MediaPipe's tables, project custom nodes).
function connectionEnds(connection) {
  return Array.isArray(connection) ? connection : [connection.start, connection.end];
}

// visibilityMin, when given, hides landmarks whose visibility is at or below
// it (the drawing_utils rule); without it every landmark draws.
function visible(landmark, visibilityMin) {
  if (!landmark) return false;
  if (visibilityMin === undefined || landmark.visibility === undefined) return true;
  return landmark.visibility > visibilityMin;
}

// Accumulates primitives in pixel space as packed instance data. Pure JS,
// no GPU: LandmarkRenderer uploads and draws it.
export class OverlayBatch {
  constructor() {
    this._data = new Float32Array(FLOATS_PER_INSTANCE * 64);
    this.count = 0;
    this.width = 1;
    this.height = 1;
  }

  begin(width, height) {
    this.width = width;
    this.height = height;
    this.count = 0;
  }

  get data() {
    return this._data.subarray(0, this.count * FLOATS_PER_INSTANCE);
  }

  segment(x0, y0, x1, y1, halfWidth, round, color) {
    if (halfWidth <= 0 || color[3] <= 0) return;
    if ((this.count + 1) * FLOATS_PER_INSTANCE > this._data.length) {
      const grown = new Float32Array(this._data.length * 2);
      grown.set(this._data);
      this._data = grown;
    }
    const o = this.count * FLOATS_PER_INSTANCE;
    const d = this._data;
    d[o] = x0;
    d[o + 1] = y0;
    d[o + 2] = x1;
    d[o + 3] = y1;
    d[o + 4] = halfWidth;
    d[o + 5] = round ? 1 : 0;
    d[o + 8] = color[0];
    d[o + 9] = color[1];
    d[o + 10] = color[2];
    d[o + 11] = color[3];
    this.count++;
  }

  // Filled circles of `radius` plus a stroke of `lineWidth`, both in `color`.
  landmarks(landmarks, { color, radius = DEFAULT_RADIUS, lineWidth = DEFAULT_LINE_WIDTH, visibilityMin } = {}) {
    if (!landmarks) return;
    const rgba = colorToVec4(color);
    const r = radius + lineWidth / 2;
    for (const lm of landmarks) {
      if (!visible(lm, visibilityMin)) continue;
      const x = lm.x * this.width;
      const y = lm.y * this.height;
      this.segment(x, y, x, y, r, true, rgba);
    }
  }

  // Lines of `lineWidth` between connected landmarks.
  connectors(landmarks, connections, { color, lineWidth = DEFAULT_LINE_WIDTH, visibilityMin } = {}) {
    if (!landmarks || !connections) return;
    const rgba = colorToVec4(color);
    const halfWidth = lineWidth / 2;
    for (const connection of connections) {
      const [start, end] = connectionEnds(connection);
      const a = landmarks[start];
      const b = landmarks[end];
      if (!visible(a, visibilityMin) || !visible(b, visibilityMin)) continue;
      this.segment(a.x * this.width, a.y * this.height, b.x * this.width, b.y * this.height, halfWidth, false, rgba);
    }
  }

  // Stroked rectangle in normalized coordinates (canvas strokeRect): each
  // side extends by half the line width so the corners meet square.
  rect(x, y, w, h, { color, lineWidth = DEFAULT_LINE_WIDTH } = {}) {
    const rgba = colorToVec4(color);
    const hw = lineWidth / 2;
    const x0 = x * this.width;
    const y0 = y * this.height;
    const x1 = (x + w) * this.width;
    const y1 = (y + h) * this.height;
    this.segment(x0 - hw, y0, x1 + hw, y0, hw, false, rgba);
    this.segment(x0 - hw, y1, x1 + hw, y1, hw, false, rgba);
    this.segment(x0, y0 - hw, x0, y1 + hw, hw, false, rgba);
    this.segment(x1, y0 - hw, x1, y1 + hw, hw, false, rgba);
  }
}

const OVERLAY_WGSL = `
struct Uniforms {
  u_size: vec2f,
};
struct Instance {
  p0: vec2f,
  p1: vec2f,
  radius: f32,
  round: f32,
  color: vec4f,
};
@group(0) @binding(0) var<uniform> u: Uniforms;
@group(0) @binding(1) var<storage, read> instances: array<Instance>;

struct VertexOutput {
  @builtin(position) position: vec4f,
  @location(0) @interpolate(flat) instance: u32,
  @location(1) pixel: vec2f,
};

// One quad (triangle strip) per instance, covering the segment plus its
// half-width and a 1px antialiasing margin.
@vertex fn vs_main(@builtin(vertex_index) vi: u32, @builtin(instance_index) ii: u32) -> VertexOutput {
  let inst = instances[ii];
  let corner = vec2f(f32(vi & 1u) * 2.0 - 1.0, f32(vi >> 1u) * 2.0 - 1.0);
  let d = inst.p1 - inst.p0;
  let len = length(d);
  let dir = select(vec2f(1.0, 0.0), d / len, len > 0.0);
  let nrm = vec2f(-dir.y, dir.x);
  let margin = inst.radius + 1.0;
  let along = len * 0.5 + select(1.0, margin, inst.round > 0.5);
  let pixel = (inst.p0 + inst.p1) * 0.5 + dir * (corner.x * along) + nrm * (corner.y * margin);
  var out: VertexOutput;
  out.position = vec4f(pixel.x / u.u_size.x * 2.0 - 1.0, 1.0 - pixel.y / u.u_size.y * 2.0, 0.0, 1.0);
  out.instance = ii;
  out.pixel = pixel;
  return out;
}

@fragment fn fs_main(in: VertexOutput) -> @location(0) vec4f {
  let inst = instances[in.instance];
  let d = inst.p1 - inst.p0;
  let len2 = dot(d, d);
  var dist: f32;
  if (inst.round > 0.5) {
    // Capsule: distance to the segment, minus the radius.
    let t = select(0.0, clamp(dot(in.pixel - inst.p0, d) / len2, 0.0, 1.0), len2 > 0.0);
    dist = length(in.pixel - (inst.p0 + d * t)) - inst.radius;
  } else {
    // Butt caps: distance to the oriented rectangle around the segment.
    if (len2 == 0.0) { discard; }
    let len = sqrt(len2);
    let dir = d / len;
    let q = in.pixel - inst.p0;
    let along = dot(q, dir);
    let across = abs(dot(q, vec2f(-dir.y, dir.x)));
    let e = vec2f(max(-along, along - len), across - inst.radius);
    dist = length(max(e, vec2f(0.0))) + min(max(e.x, e.y), 0.0);
  }
  let coverage = clamp(0.5 - dist, 0.0, 1.0);
  if (coverage <= 0.0) { discard; }
  return vec4f(inst.color.rgb, inst.color.a * coverage);
}
`;

// Draws an OverlayBatch into a RenderTarget over a background color.
export class LandmarkRenderer {
  constructor({ label = 'landmarks' } = {}) {
    this._label = label;
    this._device = getDevice();
    this.batch = new OverlayBatch();
    this._instanceBuffer = null;
    this._instanceCapacity = 0;
    this._bindGroup = null;

    const module = this._device.createShaderModule({ code: OVERLAY_WGSL, label: `${label} overlay shader` });
    this._bindGroupLayout = this._device.createBindGroupLayout({
      entries: [
        { binding: 0, visibility: GPUShaderStage.VERTEX, buffer: { type: 'uniform' } },
        { binding: 1, visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT, buffer: { type: 'read-only-storage' } },
      ],
      label: `${label} overlay bind group layout`,
    });
    this._pipeline = this._device.createRenderPipeline({
      layout: this._device.createPipelineLayout({ bindGroupLayouts: [this._bindGroupLayout] }),
      vertex: { module, entryPoint: 'vs_main' },
      fragment: {
        module,
        entryPoint: 'fs_main',
        targets: [
          {
            format: 'rgba8unorm',
            blend: {
              color: { srcFactor: 'src-alpha', dstFactor: 'one-minus-src-alpha' },
              alpha: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha' },
            },
          },
        ],
      },
      primitive: { topology: 'triangle-strip' },
      label: `${label} overlay pipeline`,
    });
    this._uniformBuffer = this._device.createBuffer({
      size: 16,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
      label: `${label} overlay uniforms`,
    });
  }

  // Start a frame; the target is sized to (width, height) at draw().
  begin(width, height) {
    this.batch.begin(width, height);
    return this.batch;
  }

  // Clear `target` to `background` ([r, g, b, a] like a color port) and draw
  // the batch over it.
  draw(target, background) {
    const device = this._device;
    const queue = getQueue();
    const { batch } = this;
    target.setSize(batch.width, batch.height);

    const [r, g, b, a] = colorToVec4(background);
    // Straight alpha in, straight alpha out for the clear; the blend above
    // then composites primitives with source-over.
    const clearValue = { r, g, b, a };

    if (batch.count > this._instanceCapacity) {
      this._instanceBuffer?.destroy();
      this._instanceCapacity = Math.max(64, 2 ** Math.ceil(Math.log2(batch.count)));
      this._instanceBuffer = device.createBuffer({
        size: this._instanceCapacity * FLOATS_PER_INSTANCE * 4,
        usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
        label: `${this._label} overlay instances`,
      });
      this._bindGroup = device.createBindGroup({
        layout: this._bindGroupLayout,
        entries: [
          { binding: 0, resource: { buffer: this._uniformBuffer } },
          { binding: 1, resource: { buffer: this._instanceBuffer } },
        ],
        label: `${this._label} overlay bind group`,
      });
    }
    if (batch.count > 0) queue.writeBuffer(this._instanceBuffer, 0, batch.data);
    queue.writeBuffer(this._uniformBuffer, 0, new Float32Array([batch.width, batch.height, 0, 0]));

    const encoder = device.createCommandEncoder({ label: `${this._label} overlay encoder` });
    const pass = encoder.beginRenderPass({
      colorAttachments: [{ view: target.view, loadOp: 'clear', storeOp: 'store', clearValue }],
      label: `${this._label} overlay pass`,
    });
    if (batch.count > 0) {
      pass.setPipeline(this._pipeline);
      pass.setBindGroup(0, this._bindGroup);
      pass.draw(4, batch.count);
    }
    pass.end();
    queue.submit([encoder.finish()]);
  }

  destroy() {
    this._instanceBuffer?.destroy();
    this._uniformBuffer?.destroy();
    this._instanceBuffer = null;
    this._uniformBuffer = null;
    this._bindGroup = null;
    this._instanceCapacity = 0;
  }
}

// ─── Canvas helpers ─────────────────────────────────────────────────────────
//
// The drawing_utils API (window.drawLandmarks / window.drawConnectors) that
// project custom nodes may call on a 2D canvas context. Same defaults as
// MediaPipe's: white, lineWidth 4, radius 6, visibilityMin 0.5.

const CANVAS_DEFAULTS = { color: 'white', lineWidth: DEFAULT_LINE_WIDTH, radius: DEFAULT_RADIUS, visibilityMin: 0.5 };

export function drawLandmarks(ctx, landmarks, options = {}) {
  if (!landmarks) return;
  const o = { ...CANVAS_DEFAULTS, fillColor: options.color, ...options };
  const { width, height } = ctx.canvas;
  ctx.save();
  ctx.fillStyle = o.fillColor ?? o.color;
  ctx.strokeStyle = o.color;
  ctx.lineWidth = o.lineWidth;
  for (const lm of landmarks) {
    if (!visible(lm, o.visibilityMin)) continue;
    ctx.beginPath();
    ctx.arc(lm.x * width, lm.y * height, o.radius, 0, 2 * Math.PI);
    ctx.fill();
    ctx.stroke();
  }
  ctx.restore();
}

export function drawConnectors(ctx, landmarks, connections, options = {}) {
  if (!landmarks || !connections) return;
  const o = { ...CANVAS_DEFAULTS, ...options };
  const { width, height } = ctx.canvas;
  ctx.save();
  ctx.strokeStyle = o.color;
  ctx.lineWidth = o.lineWidth;
  ctx.beginPath();
  for (const connection of connections) {
    const [start, end] = connectionEnds(connection);
    const a = landmarks[start];
    const b = landmarks[end];
    if (!visible(a, o.visibilityMin) || !visible(b, o.visibilityMin)) continue;
    ctx.moveTo(a.x * width, a.y * height);
    ctx.lineTo(b.x * width, b.y * height);
  }
  ctx.stroke();
  ctx.restore();
}
