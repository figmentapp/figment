// Rewrite stride-2 4x4 ConvTranspose as Conv + DepthToSpace.
//
// onnxruntime-web's WebGPU ConvTranspose kernel is a naive gather loop that
// runs several times slower than its Conv kernel. A transposed conv with a
// 4x4 kernel, stride 2 and padding 1 is exactly four stride-1 convs on the
// low-resolution input, one per output phase, interleaved by DepthToSpace:
//
//   y[2m+a] = sum_i x[i] W[2m+a-2i+1]
//     a = 0: x[m-1] W[3] + x[m] W[1]      (window [m-1, m])
//     a = 1: x[m]   W[2] + x[m+1] W[0]    (window [m, m+1])
//
// Layers with many output channels get four 2x2 convs on explicitly padded
// input (same MACs as the original). Layers with fewer than 16 output
// channels get one 3x3 conv with 4*Cout output channels instead: a matmul
// with three output columns wastes most of its tile, and the 3x3 form's
// extra MACs are cheaper than that.

import { DataType } from './proto.js';
import { getAttribute, intAttribute, intsAttribute, stringAttribute, makeNode, makeTensor, tensorData, opsetVersion } from './graph.js';

// 1-D tap tables per output phase, see the derivation above.
const TAPS_K3 = { 0: [3, 1, null], 1: [null, 2, 0] };
const TAPS_K2 = { 0: { taps: [3, 1], pads: [1, 0] }, 1: { taps: [2, 0], pads: [0, 1] } };

function isRewritable(node) {
  const kernel = getAttribute(node, 'kernel_shape') ?? [];
  const strides = getAttribute(node, 'strides') ?? [1, 1];
  const pads = getAttribute(node, 'pads') ?? [0, 0, 0, 0];
  const outputPadding = getAttribute(node, 'output_padding') ?? [0, 0];
  const dilations = getAttribute(node, 'dilations') ?? [1, 1];
  return (
    kernel.length === 2 &&
    kernel.every((k) => Number(k) === 4) &&
    strides.every((s) => Number(s) === 2) &&
    pads.length === 4 &&
    pads.every((p) => Number(p) === 1) &&
    outputPadding.every((p) => Number(p) === 0) &&
    dilations.every((d) => Number(d) === 1) &&
    Number(getAttribute(node, 'group') ?? 1) === 1
  );
}

export function rewriteConvTranspose(model) {
  const graph = model.graph;
  const report = { rewritten: 0, kept: 0 };
  if (opsetVersion(model) < 11) {
    // Pad with a pads input and DepthToSpace's mode need opset 11.
    report.kept = graph.node.filter((n) => n.opType === 'ConvTranspose').length;
    return report;
  }
  const initializers = new Map(graph.initializer.map((t) => [t.name, t]));
  const newNodes = [];
  for (const node of graph.node) {
    const weight = node.opType === 'ConvTranspose' ? initializers.get(node.input[1]) : undefined;
    if (!weight || weight.dataType !== DataType.FLOAT || !isRewritable(node)) {
      if (node.opType === 'ConvTranspose') report.kept++;
      newNodes.push(node);
      continue;
    }
    const [cin, cout] = weight.dims.map(Number);
    const W = tensorData(weight);
    const bias = node.input[2] ? initializers.get(node.input[2]) : undefined;
    const base = node.name || node.output[0];
    const x = node.input[0];
    const output = node.output[0];
    const method = cout < 16 ? 'k3' : 'k2x4';
    const addInit = (tensor) => {
      graph.initializer.push(tensor);
      return tensor.name;
    };

    if (method === 'k3') {
      // One 3x3 conv, output channel (a*2+b)*Cout + co holds phase (a, b).
      const K = new Float32Array(4 * cout * cin * 9);
      for (let a = 0; a < 2; a++) {
        for (let b = 0; b < 2; b++) {
          for (let r = 0; r < 3; r++) {
            for (let c = 0; c < 3; c++) {
              const tr = TAPS_K3[a][r];
              const tc = TAPS_K3[b][c];
              if (tr === null || tc === null) continue;
              for (let co = 0; co < cout; co++) {
                for (let ci = 0; ci < cin; ci++) {
                  K[((((a * 2 + b) * cout + co) * cin + ci) * 3 + r) * 3 + c] = W[((ci * cout + co) * 4 + tr) * 4 + tc];
                }
              }
            }
          }
        }
      }
      const inputs = [x, addInit(makeTensor(`${base}/W_k3`, [4 * cout, cin, 3, 3], DataType.FLOAT, K))];
      if (bias) {
        const B = tensorData(bias);
        const tiled = new Float32Array(4 * cout);
        for (let i = 0; i < 4; i++) tiled.set(B, i * cout);
        inputs.push(addInit(makeTensor(`${base}/B_k3`, [4 * cout], DataType.FLOAT, tiled)));
      }
      const convOut = `${base}/conv_out`;
      newNodes.push(
        makeNode(
          'Conv',
          inputs,
          [convOut],
          [intsAttribute('kernel_shape', [3, 3]), intsAttribute('pads', [1, 1, 1, 1]), intsAttribute('strides', [1, 1])],
          `${base}/conv`,
        ),
      );
      newNodes.push(
        makeNode('DepthToSpace', [convOut], [output], [intAttribute('blocksize', 2), stringAttribute('mode', 'DCR')], `${base}/d2s`),
      );
    } else {
      const phases = [];
      for (let a = 0; a < 2; a++) {
        for (let b = 0; b < 2; b++) {
          const K = new Float32Array(cout * cin * 4);
          for (let r = 0; r < 2; r++) {
            for (let c = 0; c < 2; c++) {
              const tr = TAPS_K2[a].taps[r];
              const tc = TAPS_K2[b].taps[c];
              for (let co = 0; co < cout; co++) {
                for (let ci = 0; ci < cin; ci++) {
                  K[((co * cin + ci) * 2 + r) * 2 + c] = W[((ci * cout + co) * 4 + tr) * 4 + tc];
                }
              }
            }
          }
          const [pt, pb] = TAPS_K2[a].pads;
          const [pl, pr] = TAPS_K2[b].pads;
          // Pad explicitly; the GPU Conv kernel's own asymmetric pads were not exact in every case.
          const padsName = addInit(
            makeTensor(`${base}/pads_${a}${b}`, [8], DataType.INT64, BigInt64Array.from([0, 0, pt, pl, 0, 0, pb, pr].map(BigInt))),
          );
          const padded = `${base}/padded_${a}${b}`;
          newNodes.push(makeNode('Pad', [x, padsName], [padded], [stringAttribute('mode', 'constant')], `${base}/pad_${a}${b}`));
          const inputs = [padded, addInit(makeTensor(`${base}/W_${a}${b}`, [cout, cin, 2, 2], DataType.FLOAT, K))];
          if (bias) inputs.push(bias.name);
          const out = `${base}/phase_${a}${b}`;
          newNodes.push(
            makeNode(
              'Conv',
              inputs,
              [out],
              [intsAttribute('kernel_shape', [2, 2]), intsAttribute('pads', [0, 0, 0, 0]), intsAttribute('strides', [1, 1])],
              `${base}/conv_${a}${b}`,
            ),
          );
          phases.push(out);
        }
      }
      const cat = `${base}/phases`;
      newNodes.push(makeNode('Concat', phases, [cat], [intAttribute('axis', 1)], `${base}/concat`));
      newNodes.push(
        makeNode('DepthToSpace', [cat], [output], [intAttribute('blocksize', 2), stringAttribute('mode', 'DCR')], `${base}/d2s`),
      );
    }
    // The original weight is unused now; a bias stays if the 2x2 form reuses it.
    graph.initializer.splice(graph.initializer.indexOf(weight), 1);
    if (bias && method === 'k3') graph.initializer.splice(graph.initializer.indexOf(bias), 1);
    report.rewritten++;
  }
  graph.node = newNodes;
  return report;
}
