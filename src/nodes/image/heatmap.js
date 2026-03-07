/**
 * @name Heatmap
 * @description heatmap filter based on monocular depth estimation on image.
 * @category image
 */

//experimental//

const focalIn = node.numberIn('focal length', 20.0, { min: 0.0, max: 150, step: 0.01 });
const disparityIn = node.numberIn('disparity scale', 50.0, { min: 0.0, max: 100, step: 0.1 });
const depthMinIn = node.numberIn('depth min', 0.2, { min: 0.0, max: 1.0, step: 0.01 });
const depthMaxIn = node.numberIn('depth max', 0.6, { min: 0.0, max: 1.0, step: 0.01 });

figment.createImageFilter(node, {
  label: 'heatmap',
  uniforms: { u_focal_length: 'f32', u_disparity_scale: 'f32', u_min_depth: 'f32', u_max_depth: 'f32' },
  wgsl: `
    let color = textureSample(u_input_texture, defaultSampler, in.uv);
    let disparity = (color.r - 0.5) * 2.0 * u.u_disparity_scale;
    let depth = u.u_focal_length / disparity;
    var heatmap_color: vec3f;
    let range = u.u_max_depth - u.u_min_depth;
    if (depth < u.u_min_depth) {
      heatmap_color = vec3f(0.0, 0.0, 1.0);
    } else if (depth < u.u_min_depth + range / 3.0) {
      heatmap_color = vec3f(0.0, 1.0, 1.0);
    } else if (depth < u.u_min_depth + range * 2.0 / 3.0) {
      heatmap_color = vec3f(1.0, 0.0, 1.0);
    } else if (depth < u.u_max_depth) {
      heatmap_color = vec3f(1.0, 1.0, 0.0);
    } else {
      heatmap_color = vec3f(1.0, 0.0, 0.0);
    }
    return vec4f(heatmap_color, 1.0);
  `,
  getUniforms: () => ({
    u_focal_length: focalIn.value,
    u_disparity_scale: disparityIn.value,
    u_min_depth: depthMinIn.value,
    u_max_depth: depthMaxIn.value,
  }),
});
