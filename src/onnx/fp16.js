// Convert a float32 model to float16 weights and activations.
//
// The graph's own inputs and outputs stay float32, so the model drops into
// the ONNX Image Model node unchanged; a Cast on each side does the switch.
// Ops in the block list keep float32 (with Casts around them): the
// reductions, because ORT can constant-fold them in float32 at load but has
// no float16 CPU kernel to fold them with, and a few ops whose float16
// kernels are missing or numerically fragile. Resize keeps its float32
// `roi`/`scales` inputs, which ONNX requires.
//
// No-op Cast(to=float) nodes, which some exporters sprinkle through a float32
// graph, are removed first: converting around them leaves an inconsistent
// graph that ORT rejects.

import { AttributeType, DataType } from './proto.js';
import { getAttribute, intAttribute, makeNode, makeTensor, tensorData, uniqueName } from './graph.js';

export const DEFAULT_BLOCK_OPS = [
  'ReduceSum',
  'ReduceMean',
  'ReduceMax',
  'ReduceMin',
  'ReduceProd',
  'ReduceL1',
  'ReduceL2',
  'ReduceLogSum',
  'ReduceLogSumExp',
  'ReduceSumSquare',
  'CumSum',
  'Range',
  'TopK',
  'NonMaxSuppression',
  'RoiAlign',
  'Upsample',
  'LayerNormalization',
];

// Ops whose outputs are not float regardless of their inputs.
const NON_FLOAT_PRODUCERS = new Set([
  'Shape',
  'Size',
  'ArgMax',
  'ArgMin',
  'NonZero',
  'Equal',
  'Greater',
  'GreaterOrEqual',
  'Less',
  'LessOrEqual',
  'Not',
  'And',
  'Or',
  'Xor',
  'IsNaN',
  'IsInf',
]);

// Per-op inputs that ONNX requires in float32 even in a float16 graph.
const KEEP_FLOAT32_INPUTS = { Resize: [1, 2] };

export function float32ToFloat16(values) {
  const clamped = Float32Array.from(values, (v) => (v > 65504 ? 65504 : v < -65504 ? -65504 : v));
  const half = new Float16Array(clamped);
  return new Uint16Array(half.buffer, half.byteOffset, half.length);
}

function hasConvertibleFloat32(graph, blocked) {
  const edges = new Map(); // tensor -> [float32-only edges, all edges]
  for (const node of graph.node) {
    node.input.forEach((name, ii) => {
      if (!name) return;
      const keep = blocked.has(node.opType) || (KEEP_FLOAT32_INPUTS[node.opType] ?? []).includes(ii);
      const counts = edges.get(name) ?? [0, 0];
      counts[0] += keep ? 1 : 0;
      counts[1] += 1;
      edges.set(name, counts);
    });
  }
  const convertible = (name) => {
    const counts = edges.get(name);
    return !counts || counts[0] < counts[1];
  };
  return (
    graph.initializer.some((t) => t.dataType === DataType.FLOAT && convertible(t.name)) ||
    graph.node.some((n) => n.opType === 'Constant' && getAttribute(n, 'value')?.dataType === DataType.FLOAT && convertible(n.output[0]))
  );
}

export function convertToFloat16(model, { blockOps = DEFAULT_BLOCK_OPS } = {}) {
  const graph = model.graph;
  const blocked = new Set(blockOps);
  const report = { initializersConverted: 0, castsRemoved: 0, castsInserted: 0, blockedNodes: 0 };

  // Nothing to convert (a float16 model, or one already converted): leave
  // the graph alone rather than wrap it in another pair of casts. Float32
  // constants that only feed blocked ops or Resize scales do not count.
  if (!hasConvertibleFloat32(graph, blocked)) return report;

  // 1. Remove no-op Cast(to=float) nodes.
  const rename = new Map();
  const nodes = [];
  for (const node of graph.node) {
    if (node.opType === 'Cast' && Number(getAttribute(node, 'to')) === DataType.FLOAT) {
      rename.set(node.output[0], node.input[0]);
      report.castsRemoved++;
    } else {
      nodes.push(node);
    }
  }
  const resolve = (name) => {
    while (rename.has(name)) name = rename.get(name);
    return name;
  };
  for (const node of nodes) node.input = node.input.map(resolve);
  for (const output of graph.output) {
    const source = resolve(output.name);
    if (source !== output.name) {
      // Keep the graph output's name: the producer writes it directly.
      const producer = nodes.find((n) => n.output.includes(source));
      if (producer) producer.output = producer.output.map((o) => (o === source ? output.name : o));
      for (const n of nodes) n.input = n.input.map((i) => (i === source ? output.name : i));
    }
  }
  graph.node = nodes;

  // 2. Which tensors are float? Initializers and graph inputs say so; node
  //    outputs are float unless the op says otherwise.
  const initializers = new Map(graph.initializer.map((t) => [t.name, t]));
  const producers = new Map();
  for (const node of graph.node) for (const out of node.output) producers.set(out, node);
  const isFloat = (name) => {
    if (initializers.has(name)) return initializers.get(name).dataType === DataType.FLOAT;
    const input = graph.input.find((i) => i.name === name);
    if (input) return input.type?.tensorType?.elemType === DataType.FLOAT;
    const producer = producers.get(name);
    if (!producer) return false;
    if (NON_FLOAT_PRODUCERS.has(producer.opType)) return false;
    if (producer.opType === 'Cast') return Number(getAttribute(producer, 'to')) === DataType.FLOAT;
    if (producer.opType === 'Constant') return getAttribute(producer, 'value')?.dataType === DataType.FLOAT;
    if (producer.opType === 'ConstantOfShape') return (getAttribute(producer, 'value')?.dataType ?? DataType.FLOAT) === DataType.FLOAT;
    return true;
  };

  // 3. Which tensors must stay float32: inputs of blocked nodes and the
  //    per-op float32 inputs. A constant used only that way stays float32;
  //    one shared with a converted consumer is converted and cast back.
  const float32Edges = new Set(); // `${nodeIndex}:${inputIndex}`
  const float32Consumers = new Map(); // tensor -> number of float32 edges
  const consumers = new Map(); // tensor -> number of edges
  graph.node.forEach((node, ni) => {
    node.input.forEach((name, ii) => {
      if (!name) return;
      consumers.set(name, (consumers.get(name) ?? 0) + 1);
      const keep = blocked.has(node.opType) || (KEEP_FLOAT32_INPUTS[node.opType] ?? []).includes(ii);
      if (keep && isFloat(name)) {
        float32Edges.add(`${ni}:${ii}`);
        float32Consumers.set(name, (float32Consumers.get(name) ?? 0) + 1);
      }
    });
  });
  const constantOnlyFloat32 = (name) => float32Consumers.get(name) === consumers.get(name);

  // 4. Convert float32 initializers and Constant nodes.
  for (const tensor of graph.initializer) {
    if (tensor.dataType !== DataType.FLOAT || constantOnlyFloat32(tensor.name)) continue;
    const half = float32ToFloat16(tensorData(tensor));
    Object.assign(tensor, makeTensor(tensor.name, tensor.dims, DataType.FLOAT16, half));
    report.initializersConverted++;
  }
  for (const node of graph.node) {
    if (node.opType !== 'Constant' || constantOnlyFloat32(node.output[0])) continue;
    const attribute = node.attribute.find((a) => a.name === 'value' && a.type === AttributeType.TENSOR);
    if (!attribute || attribute.t.dataType !== DataType.FLOAT) continue;
    const half = float32ToFloat16(tensorData(attribute.t));
    attribute.t = makeTensor(attribute.t.name ?? '', attribute.t.dims, DataType.FLOAT16, half);
    report.initializersConverted++;
  }

  // 5. Casts: graph inputs to float16, graph outputs back to float32, float32
  //    edges of blocked nodes, and blocked outputs back to float16.
  const result = [];
  const graphOutputs = new Set(graph.output.map((o) => o.name));
  const castTo16 = new Map(); // float32 tensor -> its float16 twin
  const castTo32 = new Map(); // float16 tensor -> its float32 twin
  const cast = (from, to, dataType) => {
    // The output name is unique in the graph, so a node named after it is too.
    result.push(makeNode('Cast', [from], [to], [intAttribute('to', dataType)], `${to}/cast`));
    report.castsInserted++;
  };
  for (const input of graph.input) {
    if (!isFloat(input.name) || initializers.has(input.name)) continue;
    const half = uniqueName(graph, `${input.name}_fp16`);
    castTo16.set(input.name, half);
    cast(input.name, half, DataType.FLOAT16);
  }
  for (let ni = 0; ni < graph.node.length; ni++) {
    const node = graph.node[ni];
    const isBlocked = blocked.has(node.opType);
    if (isBlocked) report.blockedNodes++;
    node.input = node.input.map((name, ii) => {
      if (!name || !isFloat(name)) return name;
      const wantsFloat32 = float32Edges.has(`${ni}:${ii}`);
      const isFloat32Source = (initializers.has(name) || producers.get(name)?.opType === 'Constant') && constantOnlyFloat32(name);
      const isGraphInput = graph.input.some((i) => i.name === name) && !initializers.has(name);
      if (wantsFloat32) {
        if (isFloat32Source || isGraphInput) return name;
        if (!castTo32.has(name)) {
          const wide = uniqueName(graph, `${name}_fp32`);
          castTo32.set(name, wide);
          cast(name, wide, DataType.FLOAT);
        }
        return castTo32.get(name);
      }
      if (isGraphInput) return castTo16.get(name);
      return name;
    });
    if (node.opType === 'Cast' && Number(getAttribute(node, 'to')) === DataType.FLOAT && !isBlocked) {
      // A Cast from a non-float type into the float graph now targets float16.
      node.attribute.find((a) => a.name === 'to').i = DataType.FLOAT16;
    }
    // Casts that follow the node: a blocked node computes float32 and its
    // consumers expect float16; a converted node's graph output is float16
    // and the graph promises float32.
    const after = [];
    node.output = node.output.map((out) => {
      if (!out || !isFloat(out)) return out;
      if (isBlocked) {
        if (graphOutputs.has(out)) return out;
        const wide = uniqueName(graph, `${out}_fp32`);
        after.push([wide, out, DataType.FLOAT16]);
        return wide;
      }
      if (!graphOutputs.has(out)) return out;
      const half = uniqueName(graph, `${out}_fp16`);
      after.push([half, out, DataType.FLOAT]);
      return half;
    });
    result.push(node);
    for (const args of after) cast(...args);
  }
  graph.node = result;

  // 6. Intermediate type annotations are stale now; ORT infers them.
  graph.valueInfo = [];
  return report;
}
