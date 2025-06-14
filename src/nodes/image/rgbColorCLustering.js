/**
 * @name Rgb color clustering
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
    vec3 cluster1 = vec3(1.0, 0.0, 0.0); // Red cluster
    vec3 cluster2 = vec3(0.0, 1.0, 0.0); // Green cluster
    vec3 cluster3 = vec3(0.0, 0.0, 1.0); // Blue cluster

    float dist1 = distance(color.rgb, cluster1);
    float dist2 = distance(color.rgb, cluster2);
    float dist3 = distance(color.rgb, cluster3);

    vec3 closestCluster;
    if (dist1 < dist2 && dist1 < dist3) {
      closestCluster = cluster1;
    } else if (dist2 < dist3) {
      closestCluster = cluster2;
    } else {
      closestCluster = cluster3;
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
