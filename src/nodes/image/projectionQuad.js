/**
 * @name Projection Quad
 * @description Map an image onto a draggable quadrilateral (projection mapping).
 * @category image
 */

const inputIn = node.imageIn('in');
const outputWidthIn = node.numberIn('outputWidth', 1920, { min: 1, max: 8192, step: 1 });
const outputHeightIn = node.numberIn('outputHeight', 1080, { min: 1, max: 8192, step: 1 });
const topLeftIn = node.pointIn('topLeft', new g.Point(0, 0));
const topRightIn = node.pointIn('topRight', new g.Point(1920, 0));
const bottomRightIn = node.pointIn('bottomRight', new g.Point(1920, 1080));
const bottomLeftIn = node.pointIn('bottomLeft', new g.Point(0, 1080));
// UI-only flag: controls whether the corner-drag overlay shows in fullscreen.
// Persisted as a port so it survives reload and can be bound to an expression
// or OSC trigger (e.g. hide handles when going live).
node.toggleIn('showUI', true);
const imageOut = node.imageOut('out');

const uniformsMeta = {
  u_output_size: 'vec2f',
  u_h_inv: 'mat3x3f',
};

const wgsl = `
@fragment
fn fs_main(in: VertexOutput) -> @location(0) vec4f {
  // Convert UV (0..1) to output pixel coordinates.
  let pos = vec3f(in.uv.x * u.u_output_size.x, in.uv.y * u.u_output_size.y, 1.0);

  // Apply inverse homography: output pixel -> source UV (homogeneous).
  let src = u.u_h_inv * pos;
  let src_uv = src.xy / src.z;

  // Outside the quad (i.e., source UV outside the unit square) -> transparent.
  if (src_uv.x < 0.0 || src_uv.x > 1.0 || src_uv.y < 0.0 || src_uv.y > 1.0) {
    return vec4f(0.0, 0.0, 0.0, 0.0);
  }

  return textureSampleLevel(u_input_texture, defaultSampler, src_uv, 0.0);
}
`;

// Closed-form mapping from the unit square (0,0),(1,0),(1,1),(0,1) to the
// user-defined quad (p0,p1,p2,p3). Returns a 3x3 row-major homography H.
function squareToQuad(p0, p1, p2, p3) {
  const dx1 = p1.x - p2.x;
  const dx2 = p3.x - p2.x;
  const sx = p0.x - p1.x + p2.x - p3.x;
  const dy1 = p1.y - p2.y;
  const dy2 = p3.y - p2.y;
  const sy = p0.y - p1.y + p2.y - p3.y;

  if (Math.abs(sx) < 1e-10 && Math.abs(sy) < 1e-10) {
    // Affine (parallelogram) case.
    return [p1.x - p0.x, p3.x - p0.x, p0.x, p1.y - p0.y, p3.y - p0.y, p0.y, 0, 0, 1];
  }

  const det = dx1 * dy2 - dx2 * dy1;
  const g31 = (sx * dy2 - sy * dx2) / det;
  const g32 = (sy * dx1 - sx * dy1) / det;
  return [p1.x - p0.x + g31 * p1.x, p3.x - p0.x + g32 * p3.x, p0.x, p1.y - p0.y + g31 * p1.y, p3.y - p0.y + g32 * p3.y, p0.y, g31, g32, 1];
}

function invert3x3(m) {
  const [a, b, c, d, e, f, g_, h, i] = m;
  const A = e * i - f * h;
  const B = -(d * i - f * g_);
  const C = d * h - e * g_;
  const det = a * A + b * B + c * C;
  if (Math.abs(det) < 1e-10) {
    return [1, 0, 0, 0, 1, 0, 0, 0, 1];
  }
  const inv = 1 / det;
  return [
    A * inv,
    -(b * i - c * h) * inv,
    (b * f - c * e) * inv,
    B * inv,
    (a * i - c * g_) * inv,
    -(a * f - c * d) * inv,
    C * inv,
    -(a * h - b * g_) * inv,
    (a * e - b * d) * inv,
  ];
}

// WebGPU mat3x3<f32> uses 3 vec3 columns padded to vec4 (48 bytes, 12 floats).
// Convert a row-major 9-element array into the column-major-with-padding layout
// the uniform packer expects.
function packMat3x3(rowMajor) {
  const [a, b, c, d, e, f, g_, h, i] = rowMajor;
  return [a, d, g_, 0, b, e, h, 0, c, f, i, 0];
}

let pipeline, target;

node.onStart = () => {
  const preamble = figment.generateWgslPreamble({ uniforms: uniformsMeta, textures: ['u_input_texture'] });
  pipeline = figment.createRenderPipeline({
    wgsl: preamble + wgsl,
    uniforms: uniformsMeta,
    textures: ['u_input_texture'],
    label: 'projection-quad',
  });
  target = new figment.RenderTarget({ label: 'projection-quad' });
};

node.onRender = () => {
  const img = inputIn.value;
  if (!img) return;

  const w = Math.max(1, Math.floor(outputWidthIn.value));
  const h = Math.max(1, Math.floor(outputHeightIn.value));
  target.setSize(w, h);

  const h_s2q = squareToQuad(topLeftIn.value, topRightIn.value, bottomRightIn.value, bottomLeftIn.value);
  const h_inv = invert3x3(h_s2q);

  figment.drawFullscreen(
    pipeline,
    {
      u_output_size: [w, h],
      u_h_inv: packMat3x3(h_inv),
    },
    { u_input_texture: img },
    target,
    { clearColor: { r: 0, g: 0, b: 0, a: 0 } },
  );
  imageOut.set(target);
};

node.onStop = () => {
  target?.destroy();
};
