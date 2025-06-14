/**
 * @name Canny Edges
 * @description Canny edge detection on input image.
 * @category image
 */

const fragmentShader = `
precision mediump float;
uniform sampler2D u_input_texture;
uniform vec2 u_resolution;
uniform float u_thickness;
uniform float u_factor;
varying vec2 v_uv;

float getAve(vec2 uv){
    vec3 rgb = texture2D(u_input_texture, uv).rgb;
    vec3 lum = vec3(1.,1.,1.);
    return dot(lum, rgb);
}

vec4 sobel(vec2 fragCoord, vec2 dir){
    vec2 uv2 = v_uv.xy;
    vec2 texel = 1./u_resolution.xy;
    float np = getAve(uv2 + (vec2(-1,+1) + dir ) * texel * u_thickness);
    float zp = getAve(uv2 + (vec2( 0,+1) + dir ) * texel * u_thickness);
    float pp = getAve(uv2 + (vec2(+1,+1) + dir ) * texel * u_thickness);

    float nz = getAve(uv2 + (vec2(-1, 0) + dir ) * texel * u_thickness);
    // zz = 0
    float pz = getAve(uv2 + (vec2(+1, 0) + dir ) * texel * u_thickness);

    float nn = getAve(uv2 + (vec2(-1,-1) + dir ) * texel * u_thickness);
    float zn = getAve(uv2 + (vec2( 0,-1) + dir ) * texel * u_thickness);
    float pn = getAve(uv2 + (vec2(+1,-1) + dir ) * texel * u_thickness);

    #if 0
    float gx = (np*-1. + nz*-2. + nn*-1. + pp*1. + pz*2. + pn*1.);
    float gy = (np*-1. + zp*-2. + pp*-1. + nn*1. + zn*2. + pn*1.);
    #else
    // https://www.shadertoy.com/view/Wds3Rl
    float gx = (np*-3. + nz*-10. + nn*-3. + pp*3. + pz*10. + pn*3.);
    float gy = (np*-3. + zp*-10. + pp*-3. + nn*3. + zn*10. + pn*3.);
    #endif

    vec2 G = vec2(gx,gy);
    float grad = length(G);
    float angle = atan(G.y, G.x);

    return vec4(G, grad, angle);
}

vec2 hysteresisThr(vec2 fragCoord, float mn, float mx){

    vec4 edge = sobel(fragCoord, vec2(0.0));

    vec2 dir = vec2(cos(edge.w), sin(edge.w));
    dir *= vec2(-1,1); // rotate 90 degrees.

    vec4 edgep = sobel(fragCoord, dir);
    vec4 edgen = sobel(fragCoord, -dir);

    if(edge.z < edgep.z || edge.z < edgen.z ) edge.z = 0.;

    return vec2(
        (edge.z > mn) ? edge.z : 0.,
        (edge.z > mx) ? edge.z : 0.
    );
}

float cannyEdge(vec2 fragCoord, float mn, float mx){

    vec2 np = hysteresisThr(fragCoord + vec2(-1.,+1.), mn, mx);
    vec2 zp = hysteresisThr(fragCoord + vec2( 0.,+1.), mn, mx);
    vec2 pp = hysteresisThr(fragCoord + vec2(+1.,+1.), mn, mx);

    vec2 nz = hysteresisThr(fragCoord + vec2(-1., 0.), mn, mx);
    vec2 zz = hysteresisThr(fragCoord + vec2( 0., 0.), mn, mx);
    vec2 pz = hysteresisThr(fragCoord + vec2(+1., 0.), mn, mx);

    vec2 nn = hysteresisThr(fragCoord + vec2(-1.,-1.), mn, mx);
    vec2 zn = hysteresisThr(fragCoord + vec2( 0.,-1.), mn, mx);
    vec2 pn = hysteresisThr(fragCoord + vec2(+1.,-1.), mn, mx);

    return min(1., step(1e-3, zz.x) * (zp.y + nz.y + pz.y + zn.y)*8.);
}

void main(){
    vec2 uv = v_uv;
    float edge = cannyEdge(uv.xy, u_factor, u_factor);
    gl_FragColor = vec4(vec3(1.-edge),1.0);
}
`;

const imageIn = node.imageIn('in');
const thicknessIn = node.numberIn('thickness', 1.5, { min: 0.0, max: 10.0, step: 0.1 });
const factorIn = node.numberIn('factor', 3, { min: 0.0, max: 10.0, step: 0.1 });
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
  figment.drawQuad(program, {
    u_input_texture: imageIn.value.texture,
    u_resolution: [imageIn.value.width, imageIn.value.height],
    u_thickness: thicknessIn.value,
    u_factor: factorIn.value,
  });
  framebuffer.unbind();
  imageOut.set(framebuffer);
};
