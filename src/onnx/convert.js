// Prepare an ONNX image model for Figment's WebGPU runtime.
//
//   const { bytes, report } = convertModel(originalBytes, { fp16: true, convTranspose: true });
//
// Three rewrites, exact or near-exact in output:
//   - constant subgraphs folded into initializers (see fold.js), which also
//     drops the weight copies such chains keep alive;
//   - stride-2 4x4 ConvTranspose -> Conv + DepthToSpace (see conv-transpose.js),
//     which runs several times faster on onnxruntime-web's WebGPU kernels;
//   - float32 -> float16 weights and activations with float32 inputs and
//     outputs (see fp16.js), half the file and, on a GPU with shader-f16,
//     up to 1.5x the speed.
// The report says what changed; the caller decides whether to keep the
// result (the ONNX Image Model node compares outputs before it does).

import { decodeModel, encodeModel } from './proto.js';
import { countOps, tensorByteLength } from './graph.js';
import { rewriteConvTranspose } from './conv-transpose.js';
import { convertToFloat16 } from './fp16.js';
import { foldConstants } from './fold.js';

// The converter's own version. Part of the cache key of converted models:
// bump it when a rewrite changes its output.
export const CONVERTER_VERSION = 1;

export function describeModel(bytes) {
  const model = decodeModel(bytes);
  return describe(model);
}

function describe(model) {
  const graph = model.graph;
  const initializerBytes = graph.initializer.reduce((sum, t) => sum + tensorByteLength(t), 0);
  const shape = (v) => v.type?.tensorType?.shape?.dim?.map((d) => d.dimParam ?? Number(d.dimValue)) ?? [];
  return {
    irVersion: Number(model.irVersion),
    opset: Number(model.opsetImport.find((o) => !o.domain || o.domain === 'ai.onnx')?.version ?? 0),
    nodes: graph.node.length,
    ops: countOps(graph),
    initializerBytes,
    inputs: graph.input.map((v) => ({ name: v.name, elemType: v.type?.tensorType?.elemType, shape: shape(v) })),
    outputs: graph.output.map((v) => ({ name: v.name, elemType: v.type?.tensorType?.elemType, shape: shape(v) })),
  };
}

export function convertModel(bytes, { fold = true, fp16 = true, convTranspose = true, blockOps } = {}) {
  const model = decodeModel(bytes);
  const before = describe(model);
  const report = { before, converterVersion: CONVERTER_VERSION };
  if (fold) report.fold = foldConstants(model);
  if (convTranspose) report.convTranspose = rewriteConvTranspose(model);
  if (fp16) report.fp16 = convertToFloat16(model, blockOps ? { blockOps } : undefined);
  const out = encodeModel(model);
  report.after = describe(model);
  report.bytes = { before: bytes.byteLength, after: out.byteLength };
  return { bytes: out, report };
}
