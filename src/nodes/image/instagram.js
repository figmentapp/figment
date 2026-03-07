/**
 * @name Instagram Filters
 * @description Instagram filters on image.
 * @category image
 */

const FILTER_MAP = { Valencia: 0.0, Clarendon: 1.0, Amaro: 2.0, Lark: 3.0, Nashville: 4.0, Juno: 5.0 };
const directionIn = node.selectIn('Filter', ['Amaro', 'Clarendon', 'Juno', 'Lark', 'Nashville', 'Valencia', 'None']);

figment.createImageFilter(node, {
  label: 'instagram',
  uniforms: { u_selector: 'f32' },
  wgsl: `
    let uv = in.uv;
    var texel = textureSample(u_input_texture, defaultSampler, uv);

    if (u.u_selector == 0.0) {
      texel = vec4f(mix(texel.rgb, vec3f(1.0, 0.9, 0.75), vec3f(0.2)), texel.a);
      let dist = distance(uv, vec2f(0.5, 0.5));
      let vignette = smoothstep(1.0, 0.98, dist * 1.5);
      texel = vec4f(texel.rgb * vignette, texel.a);
      return texel;
    }
    if (u.u_selector == 1.0) {
      var rgb = mix(texel.rgb, vec3f(0.97, 0.78, 0.58), vec3f(0.2));
      rgb = mix(rgb, vec3f(0.15, 0.15, 0.85), vec3f(0.2));
      rgb = mix(vec3f(0.5), rgb, vec3f(0.9));
      return vec4f(rgb, texel.a);
    }
    if (u.u_selector == 2.0) {
      var rgb = mix(vec3f(0.5), texel.rgb, vec3f(0.9));
      rgb = pow(rgb, vec3f(0.8, 0.9, 1.0));
      let filter_color = vec3f(0.9, 0.5, 0.2);
      rgb = mix(filter_color, rgb, vec3f(0.7));
      let vignette = length(uv - vec2f(0.5)) * 1.5;
      rgb = rgb * smoothstep(1.0, 0.95, vignette);
      return vec4f(rgb, texel.a);
    }
    if (u.u_selector == 3.0) {
      var rgb = mix(vec3f(0.5), texel.rgb, vec3f(0.95));
      rgb = pow(rgb, vec3f(1.2, 1.1, 1.0));
      let filter_color = vec3f(0.9, 0.8, 0.7);
      rgb = mix(filter_color, rgb, vec3f(0.9));
      let vignette = length(uv - vec2f(0.5)) * 1.5;
      rgb = rgb * smoothstep(1.0, 0.95, vignette);
      return vec4f(rgb, texel.a);
    }
    if (u.u_selector == 4.0) {
      var rgb = mix(vec3f(0.5), texel.rgb, vec3f(0.95));
      rgb = pow(rgb, vec3f(1.2, 1.1, 1.0));
      let filter_color = vec3f(0.9, 0.6, 0.4);
      rgb = mix(filter_color, rgb, vec3f(0.7));
      let toning_color1 = vec3f(0.99, 0.95, 0.85);
      let toning_color2 = vec3f(0.3, 0.1, 0.2);
      let toning = mix(toning_color1, toning_color2, vec3f(0.5));
      rgb = mix(rgb, toning, vec3f(0.2));
      let vignette = length(uv - vec2f(0.5)) * 1.5;
      rgb = rgb * smoothstep(1.0, 0.98, vignette);
      return vec4f(rgb, texel.a);
    }
    if (u.u_selector == 5.0) {
      var rgb = mix(vec3f(0.75), texel.rgb, vec3f(0.85));
      rgb = pow(rgb, vec3f(1.2, 1.1, 1.0));
      let filter_color = vec3f(0.95, 0.75, 0.55);
      rgb = mix(filter_color, rgb, vec3f(0.9));
      let toning_color1 = vec3f(1.0, 0.8, 0.6);
      let toning_color2 = vec3f(0.4, 0.3, 0.1);
      let toning = mix(toning_color1, toning_color2, vec3f(0.95));
      rgb = mix(rgb, toning, vec3f(0.3));
      let vignette = length(uv - vec2f(0.5)) * 1.5;
      rgb = rgb * smoothstep(1.0, 0.9, vignette);
      return vec4f(rgb, texel.a);
    }
    return texel;
  `,
  getUniforms: () => ({ u_selector: FILTER_MAP[directionIn.value] ?? -1.0 }),
});
