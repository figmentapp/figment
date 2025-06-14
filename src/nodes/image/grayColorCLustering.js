/**
 * @name Gray color clustering
 * @description Rgb color clustering  on image.
 * @category image
 */

const fragmentShader = `
precision mediump float;
uniform sampler2D u_input_texture;
varying vec2 v_uv;

void main() {
    vec2 uv = v_uv;
    vec4 color = texture2D(u_input_texture, uv);

    // Determine the closest color cluster
    vec3 cluster1 = vec3(1.0, 1.0, 1.0); // White cluster
    vec3 cluster2 = vec3(0.8, 0.8, 0.8); // Gray 80% white cluster
    vec3 cluster3 = vec3(0.6, 0.6, 0.6); // Gray 60% white cluster
    vec3 cluster4 = vec3(0.4, 0.4, 0.4); // Gray 40% white cluster
    vec3 cluster5 = vec3(0.2, 0.2, 0.2); // Gray 20% white cluster
    vec3 cluster6 = vec3(0.0, 0.0, 0.0); // Black cluster

    float dist1 = distance(color.rgb, cluster1);
    float dist2 = distance(color.rgb, cluster2);
    float dist3 = distance(color.rgb, cluster3);
    float dist4 = distance(color.rgb, cluster4);
    float dist5 = distance(color.rgb, cluster5);
    float dist6 = distance(color.rgb, cluster6);

    vec3 closestCluster;
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
    } else{
      closestCluster = cluster6;
    }

    // Set the output color to the closest cluster color
    gl_FragColor = vec4(closestCluster, color.a);

}
`;

const imageIn = node.imageIn('in');
const imageOut = node.imageOut('out');

let program, framebuffer;

node.onStart = () => {
  program = figment.createShaderProgram(fragmentShader);
  framebuffer = new figment.Framebuffer();
};

node.onRender = () => {
  if (!imageIn.value) return;
  framebuffer.setSize(imageIn.value.width, imageIn.value.height);
  framebuffer.bind();
  figment.clear();
  figment.drawQuad(program, { u_input_texture: imageIn.value.texture });
  framebuffer.unbind();
  imageOut.set(framebuffer);
};
