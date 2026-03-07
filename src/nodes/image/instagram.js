/**
 * @name Instagram Filters
 * @description Instagram filters on image.
 * @category image
 */

const FRAGMENT_WGSL = `
struct Uniforms {
  u_selector: f32,
};
@group(0) @binding(0) var<uniform> u: Uniforms;
@group(0) @binding(1) var defaultSampler: sampler;
@group(0) @binding(2) var u_input_texture: texture_2d<f32>;

@fragment
fn fs_main(in: VertexOutput) -> @location(0) vec4f {
  let uv = in.uv;
  var texel = textureSample(u_input_texture, defaultSampler, uv);

  if (u.u_selector == 0.0) {
    // Valencia
    texel = vec4f(mix(texel.rgb, vec3f(1.0, 0.9, 0.75), vec3f(0.2)), texel.a);
    let dist = distance(uv, vec2f(0.5, 0.5));
    let vignette = smoothstep(1.0, 0.98, dist * 1.5);
    texel = vec4f(texel.rgb * vignette, texel.a);
    return texel;
  }
  if (u.u_selector == 1.0) {
    // Clarendon
    var rgb = mix(texel.rgb, vec3f(0.97, 0.78, 0.58), vec3f(0.2));
    rgb = mix(rgb, vec3f(0.15, 0.15, 0.85), vec3f(0.2));
    rgb = mix(vec3f(0.5), rgb, vec3f(0.9));
    return vec4f(rgb, texel.a);
  }
  if (u.u_selector == 2.0) {
    // Amaro
    var rgb = mix(vec3f(0.5), texel.rgb, vec3f(0.9));
    rgb = pow(rgb, vec3f(0.8, 0.9, 1.0));
    let filter_color = vec3f(0.9, 0.5, 0.2);
    rgb = mix(filter_color, rgb, vec3f(0.7));
    let vignette = length(uv - vec2f(0.5)) * 1.5;
    rgb = rgb * smoothstep(1.0, 0.95, vignette);
    return vec4f(rgb, texel.a);
  }
  if (u.u_selector == 3.0) {
    // Lark
    var rgb = mix(vec3f(0.5), texel.rgb, vec3f(0.95));
    rgb = pow(rgb, vec3f(1.2, 1.1, 1.0));
    let filter_color = vec3f(0.9, 0.8, 0.7);
    rgb = mix(filter_color, rgb, vec3f(0.9));
    let vignette = length(uv - vec2f(0.5)) * 1.5;
    rgb = rgb * smoothstep(1.0, 0.95, vignette);
    return vec4f(rgb, texel.a);
  }
  if (u.u_selector == 4.0) {
    // Nashville
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
    // Juno
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
}
`;

const imageIn = node.imageIn('in');
const directionIn = node.selectIn('Filter', ['Amaro', 'Clarendon', 'Juno', 'Lark', 'Nashville', 'Valencia', 'None']);
const imageOut = node.imageOut('out');

let pipeline, target;

node.onStart = () => {
  pipeline = figment.createRenderPipeline({
    wgsl: FRAGMENT_WGSL,
    uniforms: { u_selector: 'f32' },
    textures: ['u_input_texture'],
    label: 'instagram',
  });
  target = new figment.RenderTarget();
};

node.onRender = () => {
  if (!imageIn.value) return;
  let u_selector;
  if (directionIn.value === 'Valencia') {
    u_selector = 0.0;
  }
  if (directionIn.value === 'Clarendon') {
    u_selector = 1.0;
  }
  if (directionIn.value === 'Amaro') {
    u_selector = 2.0;
  }
  if (directionIn.value === 'Lark') {
    u_selector = 3.0;
  }
  if (directionIn.value === 'Nashville') {
    u_selector = 4.0;
  }
  if (directionIn.value === 'Juno') {
    u_selector = 5.0;
  }
  target.setSize(imageIn.value.width, imageIn.value.height);
  figment.drawFullscreen(pipeline, { u_selector }, { u_input_texture: imageIn.value }, target);
  imageOut.set(target);
};

node.onStop = () => {
  target?.destroy();
};
