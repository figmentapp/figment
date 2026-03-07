/**
 * @name Freichen
 * @description Freichen edges shader
 * @category image
 */

const resolutionIn = node.numberIn('resolution', 512, { min: 4, max: 2048, step: 1 });

figment.createImageFilter(node, {
  label: 'freiChen',
  uniforms: { u_resolution: 'vec2f' },
  wgsl: `
    // Edge Detection Shader using Frei-Chen filter
    // Based on http://rastergrid.com/blog/2011/01/frei-chen-edge-detector
    const g0 = mat3x3f(vec3f(0.3535533845424652, 0.5, 0.3535533845424652), vec3f(0.0, 0.0, 0.0), vec3f(-0.3535533845424652, -0.5, -0.3535533845424652));
    const g1 = mat3x3f(vec3f(0.3535533845424652, 0.0, -0.3535533845424652), vec3f(0.5, 0.0, -0.5), vec3f(0.3535533845424652, 0.0, -0.3535533845424652));
    const g2 = mat3x3f(vec3f(0.0, -0.3535533845424652, 0.5), vec3f(0.3535533845424652, 0.0, -0.3535533845424652), vec3f(-0.5, 0.3535533845424652, 0.0));
    const g3 = mat3x3f(vec3f(0.5, -0.3535533845424652, 0.0), vec3f(-0.3535533845424652, 0.0, 0.3535533845424652), vec3f(0.0, 0.3535533845424652, -0.5));
    const g4 = mat3x3f(vec3f(0.0, 0.5, 0.0), vec3f(-0.5, 0.0, -0.5), vec3f(0.0, 0.5, 0.0));
    const g5 = mat3x3f(vec3f(-0.5, 0.0, 0.5), vec3f(0.0, 0.0, 0.0), vec3f(0.5, 0.0, -0.5));
    const g6 = mat3x3f(vec3f(0.1666666716337204, -0.3333333432674408, 0.1666666716337204), vec3f(-0.3333333432674408, 0.6666666865348816, -0.3333333432674408), vec3f(0.1666666716337204, -0.3333333432674408, 0.1666666716337204));
    const g7 = mat3x3f(vec3f(-0.3333333432674408, 0.1666666716337204, -0.3333333432674408), vec3f(0.1666666716337204, 0.6666666865348816, 0.1666666716337204), vec3f(-0.3333333432674408, 0.1666666716337204, -0.3333333432674408));
    const g8 = mat3x3f(vec3f(0.3333333432674408, 0.3333333432674408, 0.3333333432674408), vec3f(0.3333333432674408, 0.3333333432674408, 0.3333333432674408), vec3f(0.3333333432674408, 0.3333333432674408, 0.3333333432674408));

    @fragment
    fn fs_main(in: VertexOutput) -> @location(0) vec4f {
      let uv = in.uv;
      let texel = vec2f(1.0 / u.u_resolution.x, 1.0 / u.u_resolution.y);

      var G: array<mat3x3f, 9>;
      G[0] = g0; G[1] = g1; G[2] = g2; G[3] = g3; G[4] = g4;
      G[5] = g5; G[6] = g6; G[7] = g7; G[8] = g8;

      var I: mat3x3f;
      for (var i: i32 = 0; i < 3; i++) {
        for (var j: i32 = 0; j < 3; j++) {
          let s = textureSample(u_input_texture, defaultSampler, uv + texel * vec2f(f32(i) - 1.0, f32(j) - 1.0)).rgb;
          I[i][j] = length(s);
        }
      }

      var cnv: array<f32, 9>;
      for (var i: i32 = 0; i < 9; i++) {
        let dp3 = dot(G[i][0], I[0]) + dot(G[i][1], I[1]) + dot(G[i][2], I[2]);
        cnv[i] = dp3 * dp3;
      }

      let M = (cnv[0] + cnv[1]) + (cnv[2] + cnv[3]);
      let S = (cnv[4] + cnv[5]) + (cnv[6] + cnv[7]) + (cnv[8] + M);

      return vec4f(vec3f(sqrt(M / S)), 1.0);
    }
  `,
  getUniforms: () => ({ u_resolution: [resolutionIn.value, resolutionIn.value] }),
});
