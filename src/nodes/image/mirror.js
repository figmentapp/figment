/**
 * @name Mirror
 * @description Mirror the input image over a specific axis.
 * @category image
 */

const pivotXIn = node.numberIn('pivotX', 0.5, { min: 0, max: 1, step: 0.01 });
const pivotYIn = node.numberIn('pivotY', 0.5, { min: 0, max: 1, step: 0.01 });
const angleIn = node.numberIn('angle', 90, { min: -180, max: 180, step: 1 });

const result = figment.createImageFilter(node, {
  label: 'mirror',
  uniforms: { u_resolution: 'vec2f', u_line: 'vec3f' },
  wgsl: `
    var uv = in.uv;
    var uvp = uv * u.u_resolution;
    let d = dot(u.u_line, vec3f(uvp, 1.0));
    if (d > 0.0) {
      uvp.x = uvp.x - 2.0 * u.u_line.x * d;
      uvp.y = uvp.y - 2.0 * u.u_line.y * d;
      uv = uvp / u.u_resolution;
    }
    return textureSample(u_input_texture, defaultSampler, uv);
  `,
  getUniforms: () => {
    const img = result.inputPort.value;
    const r = (angleIn.value * Math.PI) / 180;
    const x = Math.sin(r);
    const y = -Math.cos(r);
    const z = -(pivotXIn.value * x * img.width + pivotYIn.value * y * img.height);
    return { u_resolution: [img.width, img.height], u_line: [x, y, z] };
  },
});
