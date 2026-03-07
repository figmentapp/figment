/**
 * @name Gray color clustering
 * @description Rgb color clustering  on image.
 * @category image
 */

figment.createImageFilter(node, {
  label: 'grayColorClustering',
  wgsl: `
    let uv = in.uv;
    let color = textureSample(u_input_texture, defaultSampler, uv);

    let cluster1 = vec3f(1.0, 1.0, 1.0);
    let cluster2 = vec3f(0.8, 0.8, 0.8);
    let cluster3 = vec3f(0.6, 0.6, 0.6);
    let cluster4 = vec3f(0.4, 0.4, 0.4);
    let cluster5 = vec3f(0.2, 0.2, 0.2);
    let cluster6 = vec3f(0.0, 0.0, 0.0);

    let dist1 = distance(color.rgb, cluster1);
    let dist2 = distance(color.rgb, cluster2);
    let dist3 = distance(color.rgb, cluster3);
    let dist4 = distance(color.rgb, cluster4);
    let dist5 = distance(color.rgb, cluster5);
    let dist6 = distance(color.rgb, cluster6);

    var closestCluster: vec3f;
    if (dist1 < dist2 && dist1 < dist3 && dist1 < dist4 && dist1 < dist5 && dist1 < dist6) {
      closestCluster = cluster1;
    } else if (dist1 > dist2 && dist2 < dist3 && dist2 < dist4 && dist2 < dist5 && dist2 < dist6) {
      closestCluster = cluster2;
    } else if (dist1 > dist3 && dist2 > dist3 && dist3 < dist4 && dist3 < dist5 && dist3 < dist6) {
      closestCluster = cluster3;
    } else if (dist1 > dist4 && dist2 > dist4 && dist3 > dist4 && dist4 < dist5 && dist4 < dist6) {
      closestCluster = cluster4;
    } else if (dist1 > dist5 && dist2 > dist5 && dist3 > dist5 && dist5 < dist4 && dist5 < dist6) {
      closestCluster = cluster5;
    } else {
      closestCluster = cluster6;
    }

    return vec4f(closestCluster, color.a);
  `,
});
