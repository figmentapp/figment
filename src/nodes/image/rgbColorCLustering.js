/**
 * @name Rgb color clustering
 * @description Rgb color clustering  on image.
 * @category image
 */

figment.createImageFilter(node, {
  label: 'rgbColorClustering',
  wgsl: `
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
  `,
});
