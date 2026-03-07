/**
 * @name Levels
 * @description Change the brightness/contrast/saturation.
 * @category image
 */

const brightnessIn = node.numberIn('brightness', 0.0, { min: -1, max: 1, step: 0.01 });
const contrastIn = node.numberIn('contrast', 1.0, { min: 0, max: 4, step: 0.01 });
const saturationIn = node.numberIn('saturation', 1.0, { min: 0, max: 1, step: 0.01 });

figment.createImageFilter(node, {
  label: 'levels',
  uniforms: { u_brightness: 'f32', u_contrast: 'f32', u_saturation: 'f32' },
  wgsl: `
    fn brightnessMatrix(brightness: f32) -> mat4x4f {
      return mat4x4f(
        vec4f(1.0, 0.0, 0.0, 0.0),
        vec4f(0.0, 1.0, 0.0, 0.0),
        vec4f(0.0, 0.0, 1.0, 0.0),
        vec4f(brightness, brightness, brightness, 1.0),
      );
    }

    fn contrastMatrix(contrast: f32) -> mat4x4f {
      let t = (1.0 - contrast) / 2.0;
      return mat4x4f(
        vec4f(contrast, 0.0, 0.0, 0.0),
        vec4f(0.0, contrast, 0.0, 0.0),
        vec4f(0.0, 0.0, contrast, 0.0),
        vec4f(t, t, t, 1.0),
      );
    }

    fn saturationMatrix(saturation: f32) -> mat4x4f {
      let luminance = vec3f(0.3086, 0.6094, 0.0820);
      let oneMinusSat = 1.0 - saturation;

      var red = vec3f(luminance.x * oneMinusSat);
      red = red + vec3f(saturation, 0.0, 0.0);

      var green = vec3f(luminance.y * oneMinusSat);
      green = green + vec3f(0.0, saturation, 0.0);

      var blue = vec3f(luminance.z * oneMinusSat);
      blue = blue + vec3f(0.0, 0.0, saturation);

      return mat4x4f(
        vec4f(red, 0.0),
        vec4f(green, 0.0),
        vec4f(blue, 0.0),
        vec4f(0.0, 0.0, 0.0, 1.0),
      );
    }

    @fragment
    fn fs_main(in: VertexOutput) -> @location(0) vec4f {
      let color = textureSample(u_input_texture, defaultSampler, in.uv);
      return brightnessMatrix(u.u_brightness) *
             contrastMatrix(u.u_contrast) *
             saturationMatrix(u.u_saturation) *
             color;
    }
  `,
  getUniforms: () => ({
    u_brightness: brightnessIn.value,
    u_contrast: contrastIn.value,
    u_saturation: saturationIn.value,
  }),
});
