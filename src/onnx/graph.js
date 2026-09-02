// Helpers for editing a decoded ONNX graph (see proto.js).

import { AttributeType, DataType } from './proto.js';

export function getAttribute(node, name) {
  const attribute = node.attribute.find((a) => a.name === name);
  if (!attribute) return undefined;
  switch (attribute.type) {
    case AttributeType.FLOAT:
      return attribute.f;
    case AttributeType.INT:
      return attribute.i ?? 0;
    case AttributeType.STRING:
      return new TextDecoder().decode(attribute.s);
    case AttributeType.TENSOR:
      return attribute.t;
    case AttributeType.FLOATS:
      return Array.from(attribute.floats);
    case AttributeType.INTS:
      return attribute.ints;
    default:
      return attribute;
  }
}

export function intsAttribute(name, ints) {
  return { name, type: AttributeType.INTS, ints, floats: [], strings: [], tensors: [], graphs: [] };
}

export function intAttribute(name, i) {
  return { name, type: AttributeType.INT, i, floats: [], ints: [], strings: [], tensors: [], graphs: [] };
}

export function stringAttribute(name, s) {
  return { name, type: AttributeType.STRING, s: new TextEncoder().encode(s), floats: [], ints: [], strings: [], tensors: [], graphs: [] };
}

export function makeNode(opType, inputs, outputs, attributes = [], name = '') {
  return { opType, input: inputs, output: outputs, attribute: attributes, name, domain: '' };
}

const TYPED_ARRAYS = {
  [DataType.FLOAT]: Float32Array,
  [DataType.FLOAT16]: Uint16Array,
  [DataType.INT32]: Int32Array,
  [DataType.INT64]: BigInt64Array,
  [DataType.DOUBLE]: Float64Array,
  [DataType.UINT8]: Uint8Array,
  [DataType.INT8]: Int8Array,
  [DataType.BOOL]: Uint8Array,
};

// The tensor's values as a typed array (float16 as raw uint16 bits, int64 as
// BigInt64Array). Prefers raw_data; falls back to the typed *_data fields.
export function tensorData(tensor) {
  const Typed = TYPED_ARRAYS[tensor.dataType];
  if (!Typed) throw new Error(`Unsupported tensor data type ${tensor.dataType} (${tensor.name})`);
  if (tensor.rawData && tensor.rawData.byteLength > 0) {
    const raw = tensor.rawData;
    // Typed arrays need aligned offsets; raw_data inside a protobuf rarely is.
    if (raw.byteOffset % Typed.BYTES_PER_ELEMENT !== 0) return new Typed(raw.slice().buffer);
    return new Typed(raw.buffer, raw.byteOffset, raw.byteLength / Typed.BYTES_PER_ELEMENT);
  }
  if (tensor.dataType === DataType.FLOAT) return Float32Array.from(tensor.floatData ?? []);
  if (tensor.dataType === DataType.INT64) return BigInt64Array.from((tensor.int64Data ?? []).map(BigInt));
  if (tensor.dataType === DataType.INT32) return Int32Array.from(tensor.int32Data ?? []);
  if (tensor.dataType === DataType.DOUBLE) return Float64Array.from(tensor.doubleData ?? []);
  if (tensor.dataType === DataType.FLOAT16) return Uint16Array.from(tensor.int32Data ?? []);
  return new Typed(0);
}

export function makeTensor(name, dims, dataType, data) {
  return {
    name,
    dims,
    dataType,
    rawData: new Uint8Array(data.buffer, data.byteOffset, data.byteLength),
    floatData: [],
    int32Data: [],
    stringData: [],
    int64Data: [],
    doubleData: [],
    uint64Data: [],
    externalData: [],
  };
}

export function elementCount(dims) {
  return dims.reduce((a, b) => a * Number(b), 1);
}

export function tensorByteLength(tensor) {
  if (tensor.rawData) return tensor.rawData.byteLength;
  const Typed = TYPED_ARRAYS[tensor.dataType];
  return Typed ? elementCount(tensor.dims) * Typed.BYTES_PER_ELEMENT : 0;
}

export function countOps(graph) {
  const counts = {};
  for (const node of graph.node) counts[node.opType] = (counts[node.opType] ?? 0) + 1;
  return Object.fromEntries(Object.entries(counts).sort());
}

export function opsetVersion(model, domain = '') {
  const entry = model.opsetImport.find((o) => (o.domain ?? '') === domain || (domain === '' && o.domain === 'ai.onnx'));
  return entry ? Number(entry.version) : 0;
}

// A name not used by any tensor in the graph.
export function uniqueName(graph, base) {
  const used = new Set();
  for (const t of graph.initializer) used.add(t.name);
  for (const v of [...graph.input, ...graph.output]) used.add(v.name);
  for (const n of graph.node) for (const name of [...n.input, ...n.output]) used.add(name);
  if (!used.has(base)) return base;
  let i = 1;
  while (used.has(`${base}_${i}`)) i++;
  return `${base}_${i}`;
}
