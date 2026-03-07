/**
 * @name Brannan
 * @description Brannan instagram filter on image.
 * @category image
 */

//https://www.shadertoy.com/view/4lSyDK

const grayRatio = node.numberIn('grayscale ratio', 0.6, { min: 0, max: 1.0, step: 0.01 });
const satRatio = node.numberIn('saturation ratio', 0.7, { min: 0.0, max: 1.0, step: 0.01 });

figment.createImageFilter(node, {
  label: 'brannan',
  uniforms: { u_gray: 'f32', u_saturation: 'f32' },
  wgsl: `
    fn overlay_f(s: f32, d: f32) -> f32 {
      if (d < 0.5) {
        return 2.0 * s * d;
      }
      return 1.0 - 2.0 * (1.0 - s) * (1.0 - d);
    }

    fn overlay_v(s: vec3f, d: vec3f) -> vec3f {
      return vec3f(overlay_f(s.x, d.x), overlay_f(s.y, d.y), overlay_f(s.z, d.z));
    }

    fn grayScale(col: vec3f) -> f32 {
      return dot(col, vec3f(0.3, 0.59, 0.11));
    }

    fn saturationMatrix(saturation: f32) -> mat3x3f {
      let luminance = vec3f(0.3086, 0.6094, 0.0820);
      let oneMinusSat = 1.0 - saturation;
      var red = vec3f(luminance.x * oneMinusSat);
      red.x = red.x + saturation;
      var green = vec3f(luminance.y * oneMinusSat);
      green.y = green.y + saturation;
      var blue = vec3f(luminance.z * oneMinusSat);
      blue.z = blue.z + saturation;
      return mat3x3f(red, green, blue);
    }

    fn levels(col_in: vec3f, inleft: vec3f, inright: vec3f, outleft: vec3f, outright: vec3f) -> vec3f {
      var col = clamp(col_in, inleft, inright);
      col = (col - inleft) / (inright - inleft);
      col = outleft + col * (outright - outleft);
      return col;
    }

    fn brightnessAdjust(color: vec3f, b: f32) -> vec3f {
      return color + b;
    }

    fn contrastAdjust(color: vec3f, c: f32) -> vec3f {
      let t = 0.5 - c * 0.5;
      return color * c + t;
    }

    @fragment
    fn fs_main(in: VertexOutput) -> @location(0) vec4f {
      var col = textureSample(u_input_texture, defaultSampler, in.uv).rgb;
      var gray = vec3f(grayScale(col));
      col = saturationMatrix(u.u_saturation) * col;
      gray = overlay_v(gray, col);
      col = mix(gray, col, vec3f(u.u_gray));
      col = levels(col, vec3f(0.0, 0.0, 0.0) / 255.0, vec3f(228.0, 255.0, 239.0) / 255.0,
                   vec3f(23.0, 3.0, 12.0) / 255.0, vec3f(255.0) / 255.0);
      col = brightnessAdjust(col, -0.1);
      col = contrastAdjust(col, 1.05);
      let tint = vec3f(255.0, 248.0, 242.0) / 255.0;
      col = levels(col, vec3f(0.0, 0.0, 0.0) / 255.0, vec3f(255.0, 224.0, 255.0) / 255.0,
                   vec3f(9.0, 20.0, 18.0) / 255.0, vec3f(255.0) / 255.0);
      col = pow(col, vec3f(0.91, 0.91, 0.91 * 0.94));
      col = brightnessAdjust(col, -0.04);
      col = contrastAdjust(col, 1.14);
      col = tint * col;
      return vec4f(col, 1.0);
    }
  `,
  getUniforms: () => ({
    u_gray: grayRatio.value,
    u_saturation: satRatio.value,
  }),
});
