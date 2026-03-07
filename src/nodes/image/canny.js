/**
 * @name Canny Edges
 * @description Canny edge detection on input image.
 * @category image
 */

const FRAGMENT_WGSL = `
struct Uniforms {
  u_resolution: vec2f,
  u_thickness: f32,
  u_factor: f32,
};
@group(0) @binding(0) var<uniform> u: Uniforms;
@group(0) @binding(1) var defaultSampler: sampler;
@group(0) @binding(2) var u_input_texture: texture_2d<f32>;

fn getAve(uv: vec2f) -> f32 {
    let rgb = textureSample(u_input_texture, defaultSampler, uv).rgb;
    let lum = vec3f(1.0, 1.0, 1.0);
    return dot(lum, rgb);
}

fn sobel(fragCoord: vec2f, dir: vec2f, base_uv: vec2f) -> vec4f {
    let uv2 = base_uv;
    let texel = 1.0 / u.u_resolution;
    let np = getAve(uv2 + (vec2f(-1.0, 1.0) + dir) * texel * u.u_thickness);
    let zp = getAve(uv2 + (vec2f(0.0, 1.0) + dir) * texel * u.u_thickness);
    let pp = getAve(uv2 + (vec2f(1.0, 1.0) + dir) * texel * u.u_thickness);

    let nz = getAve(uv2 + (vec2f(-1.0, 0.0) + dir) * texel * u.u_thickness);
    let pz = getAve(uv2 + (vec2f(1.0, 0.0) + dir) * texel * u.u_thickness);

    let nn = getAve(uv2 + (vec2f(-1.0, -1.0) + dir) * texel * u.u_thickness);
    let zn = getAve(uv2 + (vec2f(0.0, -1.0) + dir) * texel * u.u_thickness);
    let pn = getAve(uv2 + (vec2f(1.0, -1.0) + dir) * texel * u.u_thickness);

    // Scharr operator
    let gx = (np * -3.0 + nz * -10.0 + nn * -3.0 + pp * 3.0 + pz * 10.0 + pn * 3.0);
    let gy = (np * -3.0 + zp * -10.0 + pp * -3.0 + nn * 3.0 + zn * 10.0 + pn * 3.0);

    let G = vec2f(gx, gy);
    let grad = length(G);
    let angle = atan2(G.y, G.x);

    return vec4f(G, grad, angle);
}

fn hysteresisThr(fragCoord: vec2f, mn: f32, mx: f32, base_uv: vec2f) -> vec2f {
    let edge = sobel(fragCoord, vec2f(0.0), base_uv);

    var dir = vec2f(cos(edge.w), sin(edge.w));
    dir = dir * vec2f(-1.0, 1.0); // rotate 90 degrees

    let edgep = sobel(fragCoord, dir, base_uv);
    let edgen = sobel(fragCoord, -dir, base_uv);

    var edge_z = edge.z;
    if (edge_z < edgep.z || edge_z < edgen.z) {
        edge_z = 0.0;
    }

    return vec2f(
        select(0.0, edge_z, edge_z > mn),
        select(0.0, edge_z, edge_z > mx)
    );
}

fn cannyEdge(fragCoord: vec2f, mn: f32, mx: f32) -> f32 {
    let np = hysteresisThr(fragCoord + vec2f(-1.0, 1.0), mn, mx, fragCoord);
    let zp = hysteresisThr(fragCoord + vec2f(0.0, 1.0), mn, mx, fragCoord);
    let pp = hysteresisThr(fragCoord + vec2f(1.0, 1.0), mn, mx, fragCoord);

    let nz = hysteresisThr(fragCoord + vec2f(-1.0, 0.0), mn, mx, fragCoord);
    let zz = hysteresisThr(fragCoord + vec2f(0.0, 0.0), mn, mx, fragCoord);
    let pz = hysteresisThr(fragCoord + vec2f(1.0, 0.0), mn, mx, fragCoord);

    let nn = hysteresisThr(fragCoord + vec2f(-1.0, -1.0), mn, mx, fragCoord);
    let zn = hysteresisThr(fragCoord + vec2f(0.0, -1.0), mn, mx, fragCoord);
    let pn = hysteresisThr(fragCoord + vec2f(1.0, -1.0), mn, mx, fragCoord);

    return min(1.0, step(1e-3, zz.x) * (zp.y + nz.y + pz.y + zn.y) * 8.0);
}

@fragment
fn fs_main(in: VertexOutput) -> @location(0) vec4f {
    let uv = in.uv;
    let edge = cannyEdge(uv, u.u_factor, u.u_factor);
    return vec4f(vec3f(1.0 - edge), 1.0);
}
`;

const imageIn = node.imageIn('in');
const thicknessIn = node.numberIn('thickness', 1.5, { min: 0.0, max: 10.0, step: 0.1 });
const factorIn = node.numberIn('factor', 3, { min: 0.0, max: 10.0, step: 0.1 });
const imageOut = node.imageOut('out');

let pipeline, target;

node.onStart = () => {
  pipeline = figment.createRenderPipeline({
    wgsl: FRAGMENT_WGSL,
    uniforms: { u_resolution: 'vec2f', u_thickness: 'f32', u_factor: 'f32' },
    textures: ['u_input_texture'],
    label: 'canny',
  });
  target = new figment.RenderTarget();
};

node.onRender = () => {
  if (!imageIn.value) return;
  target.setSize(imageIn.value.width, imageIn.value.height);
  figment.drawFullscreen(
    pipeline,
    {
      u_resolution: [imageIn.value.width, imageIn.value.height],
      u_thickness: thicknessIn.value,
      u_factor: factorIn.value,
    },
    { u_input_texture: imageIn.value },
    target,
  );
  imageOut.set(target);
};

node.onStop = () => {
  target?.destroy();
};
