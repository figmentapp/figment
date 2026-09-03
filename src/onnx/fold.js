// Fold constant subgraphs into initializers.
//
// Exporters leave chains of arithmetic on constants in the graph: StyleGAN's
// demodulation, for instance, reduces a constant weight to a per-channel
// scale with Mul, ReduceSum, Sqrt and Div every frame. ORT folds such chains
// at load, but only in float32: its CPU has no float16 reduction kernels.
// Folding them here, before the float16 pass, drops the constant copies of
// the weights from the file (the difference between a 275 MB and a 147 MB
// StyleGAN) and leaves nothing for ORT to do at load.
//
// Only float32 tensors and the ops below are folded; anything else stays.

import { DataType } from './proto.js';
import { getAttribute, makeTensor, tensorData, elementCount } from './graph.js';

const UNARY = {
  Sqrt: Math.sqrt,
  Reciprocal: (x) => 1 / x,
  Neg: (x) => -x,
  Exp: Math.exp,
  Log: Math.log,
  Abs: Math.abs,
};

const BINARY = {
  Add: (a, b) => a + b,
  Sub: (a, b) => a - b,
  Mul: (a, b) => a * b,
  Div: (a, b) => a / b,
  Pow: Math.pow,
};

const REDUCE = {
  ReduceSum: (values) => values.reduce((s, v) => s + v, 0),
  ReduceMean: (values) => values.reduce((s, v) => s + v, 0) / values.length,
  ReduceMax: (values) => Math.max(...values),
  ReduceMin: (values) => Math.min(...values),
};

const SHAPE_OPS = new Set(['Unsqueeze', 'Squeeze', 'Reshape', 'Flatten']);

function transpose(input, perm) {
  const rank = input.dims.length;
  const order = perm.length ? perm.map(Number) : input.dims.map((_, i) => rank - 1 - i);
  const dims = order.map((axis) => input.dims[axis]);
  const inStrides = strides(input.dims);
  const out = new Float32Array(input.data.length);
  const index = new Array(rank).fill(0);
  for (let i = 0; i < out.length; i++) {
    let src = 0;
    for (let k = 0; k < rank; k++) src += index[k] * inStrides[order[k]];
    out[i] = input.data[src];
    for (let k = rank - 1; k >= 0; k--) {
      if (++index[k] < dims[k]) break;
      index[k] = 0;
    }
  }
  return { dims, data: out };
}

function strides(dims) {
  const out = new Array(dims.length);
  let s = 1;
  for (let i = dims.length - 1; i >= 0; i--) {
    out[i] = s;
    s *= dims[i];
  }
  return out;
}

// Numpy-style broadcasting of two float32 tensors.
function broadcast(a, b, fn) {
  const rank = Math.max(a.dims.length, b.dims.length);
  const padDims = (dims) => [...new Array(rank - dims.length).fill(1), ...dims];
  const da = padDims(a.dims);
  const db = padDims(b.dims);
  const dims = da.map((d, i) => {
    if (d !== db[i] && d !== 1 && db[i] !== 1) throw new Error(`Cannot broadcast ${a.dims} with ${b.dims}`);
    return Math.max(d, db[i]);
  });
  const sa = strides(da).map((s, i) => (da[i] === 1 ? 0 : s));
  const sb = strides(db).map((s, i) => (db[i] === 1 ? 0 : s));
  const out = new Float32Array(elementCount(dims));
  const index = new Array(rank).fill(0);
  for (let i = 0; i < out.length; i++) {
    let ia = 0;
    let ib = 0;
    for (let k = 0; k < rank; k++) {
      ia += index[k] * sa[k];
      ib += index[k] * sb[k];
    }
    out[i] = fn(a.data[ia], b.data[ib]);
    for (let k = rank - 1; k >= 0; k--) {
      if (++index[k] < dims[k]) break;
      index[k] = 0;
    }
  }
  return { dims, data: out };
}

function reduce(input, axes, keepdims, fn) {
  const rank = input.dims.length;
  const reduced = new Set((axes.length ? axes : input.dims.map((_, i) => i)).map((a) => (a < 0 ? a + rank : a)));
  const outDims = input.dims.map((d, i) => (reduced.has(i) ? 1 : d));
  const outStrides = strides(outDims);
  const groups = new Map();
  const index = new Array(rank).fill(0);
  for (let i = 0; i < input.data.length; i++) {
    let o = 0;
    for (let k = 0; k < rank; k++) if (!reduced.has(k)) o += index[k] * outStrides[k];
    if (!groups.has(o)) groups.set(o, []);
    groups.get(o).push(input.data[i]);
    for (let k = rank - 1; k >= 0; k--) {
      if (++index[k] < input.dims[k]) break;
      index[k] = 0;
    }
  }
  const out = new Float32Array(elementCount(outDims));
  for (const [o, values] of groups) out[o] = fn(values);
  const dims = keepdims ? outDims : outDims.filter((_, i) => !reduced.has(i));
  return { dims, data: out };
}

function reshapeDims(node, input, values) {
  const rank = input.dims.length;
  switch (node.opType) {
    case 'Unsqueeze': {
      const axes = values.axes ?? getAttribute(node, 'axes') ?? [];
      const outRank = rank + axes.length;
      const set = new Set(axes.map((a) => (Number(a) < 0 ? Number(a) + outRank : Number(a))));
      const dims = [];
      let j = 0;
      for (let i = 0; i < outRank; i++) dims.push(set.has(i) ? 1 : input.dims[j++]);
      return dims;
    }
    case 'Squeeze': {
      const axes = values.axes ?? getAttribute(node, 'axes') ?? [];
      const set = new Set(axes.map((a) => (Number(a) < 0 ? Number(a) + rank : Number(a))));
      return input.dims.filter((d, i) => (set.size ? !set.has(i) : d !== 1));
    }
    case 'Flatten': {
      const axis = Number(getAttribute(node, 'axis') ?? 1);
      return [elementCount(input.dims.slice(0, axis)), elementCount(input.dims.slice(axis))];
    }
    case 'Reshape': {
      const shape = values.shape.map(Number);
      const known = shape.reduce((p, d, i) => (d === -1 ? p : p * (d === 0 ? input.dims[i] : d)), 1);
      return shape.map((d, i) => (d === -1 ? input.data.length / known : d === 0 ? input.dims[i] : d));
    }
    default:
      return null;
  }
}

export function foldConstants(model) {
  const graph = model.graph;
  const report = { nodesFolded: 0, initializersRemoved: 0 };
  const constants = new Map(); // tensor name -> { dims, data (Float32Array | number[] for int64) }
  const register = (name, tensor) => {
    if (tensor.dataType === DataType.FLOAT) constants.set(name, { dims: tensor.dims.map(Number), data: tensorData(tensor), float: true });
    else if (tensor.dataType === DataType.INT64)
      constants.set(name, { dims: tensor.dims.map(Number), data: Array.from(tensorData(tensor), Number) });
  };
  for (const tensor of graph.initializer) register(tensor.name, tensor);
  for (const node of graph.node) {
    if (node.opType === 'Constant') {
      const value = getAttribute(node, 'value');
      if (value?.dataType !== undefined) register(node.output[0], value);
    }
  }
  const graphOutputs = new Set(graph.output.map((o) => o.name));
  const kept = [];
  for (const node of graph.node) {
    const inputs = node.input.map((name) => (name ? constants.get(name) : null));
    const allConstant = node.input.every((name, i) => !name || inputs[i]);
    const floatInput = inputs[0]?.float;
    let result = null;
    if (allConstant && floatInput && node.output.length === 1 && !graphOutputs.has(node.output[0])) {
      try {
        if (node.opType === 'Cast' && Number(getAttribute(node, 'to')) === DataType.FLOAT) {
          result = { dims: inputs[0].dims, data: inputs[0].data };
        } else if (UNARY[node.opType]) {
          result = { dims: inputs[0].dims, data: inputs[0].data.map(UNARY[node.opType]) };
        } else if (BINARY[node.opType] && inputs[1]?.float) {
          result = broadcast(inputs[0], inputs[1], BINARY[node.opType]);
        } else if (REDUCE[node.opType]) {
          const axes = (inputs[1]?.data ?? getAttribute(node, 'axes') ?? []).map(Number);
          result = reduce(inputs[0], axes, Number(getAttribute(node, 'keepdims') ?? 1) !== 0, REDUCE[node.opType]);
        } else if (node.opType === 'Transpose') {
          result = transpose(inputs[0], getAttribute(node, 'perm') ?? []);
        } else if (SHAPE_OPS.has(node.opType)) {
          const dims = reshapeDims(node, inputs[0], { axes: inputs[1]?.data, shape: inputs[1]?.data });
          if (dims && elementCount(dims) === inputs[0].data.length) result = { dims, data: inputs[0].data };
        }
      } catch {
        result = null;
      }
    }
    if (!result) {
      kept.push(node);
      continue;
    }
    const name = node.output[0];
    constants.set(name, { dims: result.dims, data: Float32Array.from(result.data), float: true });
    graph.initializer.push(makeTensor(name, result.dims, DataType.FLOAT, Float32Array.from(result.data)));
    report.nodesFolded++;
  }
  // Drop initializers and Constant nodes nothing reads any more (the folded
  // nodes' inputs).
  const used = new Set();
  for (const node of kept) if (node.opType !== 'Constant') for (const name of node.input) used.add(name);
  for (const output of graph.output) used.add(output.name);
  graph.node = kept.filter((node) => node.opType !== 'Constant' || used.has(node.output[0]));
  const before = graph.initializer.length;
  graph.initializer = graph.initializer.filter((t) => used.has(t.name));
  report.initializersRemoved = before - graph.initializer.length;
  return report;
}
