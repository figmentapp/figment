/**
 * @name Rgb color clustering
 * @description Rgb color clustering  on image.
 * @category image
 */

const FRAGMENT_WGSL = `
struct Uniforms {
  _pad: f32,
};
@group(0) @binding(0) var<uniform> u: Uniforms;
@group(0) @binding(1) var defaultSampler: sampler;
@group(0) @binding(2) var u_input_texture: texture_2d<f32>;

@fragment
fn fs_main(in: VertexOutput) -> @location(0) vec4f {
  let uv = in.uv;
  let color = textureSample(u_input_texture, defaultSampler, uv);

  // Determine the closest color cluster
  let cluster1 = vec3f(1.0, 0.0, 0.0); // Red cluster
  let cluster2 = vec3f(0.0, 1.0, 0.0); // Green cluster
  let cluster3 = vec3f(0.0, 0.0, 1.0); // Blue cluster

  let dist1 = distance(color.rgb, cluster1);
  let dist2 = distance(color.rgb, cluster2);
  let dist3 = distance(color.rgb, cluster3);

  var closestCluster: vec3f;
  if (dist1 < dist2 && dist1 < dist3) {
    closestCluster = cluster1;
  } else if (dist2 < dist3) {
    closestCluster = cluster2;
  } else {
    closestCluster = cluster3;
  }

  return vec4f(closestCluster, color.a);
}
`;

const imageIn = node.imageIn('in');
const imageOut = node.imageOut('out');

let pipeline, target;

node.onStart = () => {
  pipeline = figment.createRenderPipeline({
    wgsl: FRAGMENT_WGSL,
    uniforms: {},
    textures: ['u_input_texture'],
    label: 'rgbColorClustering',
  });
  target = new figment.RenderTarget();
};

node.onRender = () => {
  if (!imageIn.value) return;
  target.setSize(imageIn.value.width, imageIn.value.height);
  figment.drawFullscreen(pipeline, {}, { u_input_texture: imageIn.value }, target);
  imageOut.set(target);
};

node.onStop = () => {
  target?.destroy();
};
