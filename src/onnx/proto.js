// A small protobuf codec for ONNX model files.
//
// ONNX models are protobuf messages (onnx.proto3). This reads them into plain
// objects, lets the converter edit nodes and tensors, and writes them back.
// The schema below names the fields the converter touches or that ORT needs;
// fields absent from it are kept as raw bytes and written back unchanged, so
// a model round-trips even when it uses parts of the schema not listed here.
// Tensor payloads (raw_data) stay views into the source buffer: decoding a
// 400 MB model copies nothing but its structure.
//
// Numbers: int32/int64/enum fields decode to JS numbers when they fit in
// 2^53 and to BigInt otherwise (INT64_MAX is common in Slice ends). The
// encoder accepts both.

const WIRE_VARINT = 0;
const WIRE_FIXED64 = 1;
const WIRE_LENGTH = 2;
const WIRE_FIXED32 = 5;

// field number -> [name, kind, repeated, messageName]
// kinds: message, string, bytes, int64, int32, uint64, float, double, enum
// Repeated scalars are written one element per tag, as ONNX's canonical
// proto2 schema does, except the tensor data arrays marked [packed=true] there.
const SCHEMA = {
  ModelProto: {
    1: ['irVersion', 'int64'],
    2: ['producerName', 'string'],
    3: ['producerVersion', 'string'],
    4: ['domain', 'string'],
    5: ['modelVersion', 'int64'],
    6: ['docString', 'string'],
    7: ['graph', 'message', false, 'GraphProto'],
    8: ['opsetImport', 'message', true, 'OperatorSetIdProto'],
    14: ['metadataProps', 'message', true, 'StringStringEntryProto'],
    25: ['functions', 'message', true, 'FunctionProto'],
  },
  GraphProto: {
    1: ['node', 'message', true, 'NodeProto'],
    2: ['name', 'string'],
    5: ['initializer', 'message', true, 'TensorProto'],
    10: ['docString', 'string'],
    11: ['input', 'message', true, 'ValueInfoProto'],
    12: ['output', 'message', true, 'ValueInfoProto'],
    13: ['valueInfo', 'message', true, 'ValueInfoProto'],
  },
  NodeProto: {
    1: ['input', 'string', true],
    2: ['output', 'string', true],
    3: ['name', 'string'],
    4: ['opType', 'string'],
    5: ['attribute', 'message', true, 'AttributeProto'],
    6: ['docString', 'string'],
    7: ['domain', 'string'],
  },
  AttributeProto: {
    1: ['name', 'string'],
    2: ['f', 'float'],
    3: ['i', 'int64'],
    4: ['s', 'bytes'],
    5: ['t', 'message', false, 'TensorProto'],
    6: ['g', 'message', false, 'GraphProto'],
    7: ['floats', 'float', true],
    8: ['ints', 'int64', true],
    9: ['strings', 'bytes', true],
    10: ['tensors', 'message', true, 'TensorProto'],
    11: ['graphs', 'message', true, 'GraphProto'],
    13: ['docString', 'string'],
    20: ['type', 'enum'],
  },
  TensorProto: {
    1: ['dims', 'int64', true],
    2: ['dataType', 'int32'],
    4: ['floatData', 'float', true, null, true],
    5: ['int32Data', 'int32', true, null, true],
    6: ['stringData', 'bytes', true],
    7: ['int64Data', 'int64', true, null, true],
    8: ['name', 'string'],
    9: ['rawData', 'bytes'],
    10: ['doubleData', 'double', true, null, true],
    11: ['uint64Data', 'uint64', true, null, true],
    12: ['docString', 'string'],
    13: ['externalData', 'message', true, 'StringStringEntryProto'],
    14: ['dataLocation', 'enum'],
  },
  ValueInfoProto: {
    1: ['name', 'string'],
    2: ['type', 'message', false, 'TypeProto'],
    3: ['docString', 'string'],
  },
  TypeProto: {
    1: ['tensorType', 'message', false, 'TypeProtoTensor'],
    6: ['denotation', 'string'],
  },
  TypeProtoTensor: {
    1: ['elemType', 'int32'],
    2: ['shape', 'message', false, 'TensorShapeProto'],
  },
  TensorShapeProto: {
    1: ['dim', 'message', true, 'Dimension'],
  },
  Dimension: {
    1: ['dimValue', 'int64'],
    2: ['dimParam', 'string'],
    3: ['denotation', 'string'],
  },
  OperatorSetIdProto: {
    1: ['domain', 'string'],
    2: ['version', 'int64'],
  },
  StringStringEntryProto: {
    1: ['key', 'string'],
    2: ['value', 'string'],
  },
  FunctionProto: {},
};

// Attribute types (AttributeProto.AttributeType) and tensor element types
// (TensorProto.DataType) the converter needs by name.
export const AttributeType = {
  FLOAT: 1,
  INT: 2,
  STRING: 3,
  TENSOR: 4,
  GRAPH: 5,
  FLOATS: 6,
  INTS: 7,
  STRINGS: 8,
  TENSORS: 9,
  GRAPHS: 10,
};

export const DataType = {
  FLOAT: 1,
  UINT8: 2,
  INT8: 3,
  UINT16: 4,
  INT16: 5,
  INT32: 6,
  INT64: 7,
  STRING: 8,
  BOOL: 9,
  FLOAT16: 10,
  DOUBLE: 11,
};

const UNKNOWN = Symbol('unknown fields');
const PACKABLE = new Set(['int64', 'int32', 'uint64', 'float', 'double', 'enum']);
const textDecoder = new TextDecoder();
const textEncoder = new TextEncoder();

// ─── Decoding ───────────────────────────────────────────────────────────────

class Reader {
  constructor(bytes) {
    this.bytes = bytes;
    this.pos = 0;
    this.view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  }

  get done() {
    return this.pos >= this.bytes.length;
  }

  // Varints up to 64 bits; returns a number when safe, else a BigInt.
  varint() {
    const start = this.pos;
    let result = 0;
    let shift = 0;
    for (;;) {
      if (this.pos >= this.bytes.length) throw new Error('Truncated protobuf message');
      const byte = this.bytes[this.pos++];
      if (shift < 49) {
        result += (byte & 0x7f) * 2 ** shift;
      } else {
        // Beyond 2^53: redo the whole varint with BigInt.
        return this._bigVarint(start);
      }
      if ((byte & 0x80) === 0) return result;
      shift += 7;
    }
  }

  _bigVarint(start) {
    this.pos = start;
    let result = 0n;
    let shift = 0n;
    for (;;) {
      const byte = this.bytes[this.pos++];
      result |= BigInt(byte & 0x7f) << shift;
      if ((byte & 0x80) === 0) break;
      shift += 7n;
    }
    return result;
  }

  bytesField() {
    const length = Number(this.varint());
    const slice = this.bytes.subarray(this.pos, this.pos + length);
    this.pos += length;
    return slice;
  }

  fixed32() {
    const v = this.view.getFloat32(this.pos, true);
    this.pos += 4;
    return v;
  }

  fixed64() {
    const v = this.view.getFloat64(this.pos, true);
    this.pos += 8;
    return v;
  }

  skip(wireType) {
    switch (wireType) {
      case WIRE_VARINT:
        this.varint();
        break;
      case WIRE_FIXED64:
        this.pos += 8;
        break;
      case WIRE_LENGTH:
        this.bytesField();
        break;
      case WIRE_FIXED32:
        this.pos += 4;
        break;
      default:
        throw new Error(`Unsupported protobuf wire type ${wireType}`);
    }
  }
}

// int64 varints are two's complement in 64 bits; map back to signed.
function toSigned64(value) {
  if (typeof value === 'bigint') {
    const signed = BigInt.asIntN(64, value);
    return Number.isSafeInteger(Number(signed)) ? Number(signed) : signed;
  }
  return value;
}

function toSigned32(value) {
  if (typeof value === 'bigint') return Number(BigInt.asIntN(32, value));
  return value >= 2 ** 31 ? value - 2 ** 32 : value;
}

function decodeScalar(reader, kind, wireType) {
  switch (kind) {
    case 'int64':
      return toSigned64(reader.varint());
    case 'uint64':
      return reader.varint();
    case 'int32':
    case 'enum':
      return toSigned32(reader.varint());
    case 'float':
      return reader.fixed32();
    case 'double':
      return reader.fixed64();
    default:
      throw new Error(`Not a scalar kind: ${kind}`);
  }
}

function decodePacked(bytes, kind) {
  const reader = new Reader(bytes);
  const values = [];
  while (!reader.done) values.push(decodeScalar(reader, kind, null));
  if (kind === 'float') return Float32Array.from(values);
  return values;
}

export function decodeMessage(bytes, messageName) {
  const schema = SCHEMA[messageName];
  if (!schema) throw new Error(`Unknown message type ${messageName}`);
  const reader = new Reader(bytes);
  const message = {};
  const unknown = [];
  for (const [, [name, , repeated]] of Object.entries(schema)) {
    if (repeated) message[name] = [];
  }
  while (!reader.done) {
    const tag = Number(reader.varint());
    const fieldNumber = tag >>> 3;
    const wireType = tag & 7;
    const field = schema[fieldNumber];
    if (!field) {
      const start = reader.pos;
      reader.skip(wireType);
      unknown.push({ tag, bytes: reader.bytes.subarray(start, reader.pos) });
      continue;
    }
    const [name, kind, repeated, subMessage] = field;
    let value;
    if (kind === 'message') {
      value = decodeMessage(reader.bytesField(), subMessage);
    } else if (kind === 'string') {
      value = textDecoder.decode(reader.bytesField());
    } else if (kind === 'bytes') {
      value = reader.bytesField();
    } else if (wireType === WIRE_LENGTH && PACKABLE.has(kind)) {
      const packed = decodePacked(reader.bytesField(), kind);
      if (repeated) {
        if (kind === 'float' && message[name].length === 0) message[name] = packed;
        else message[name] = [...message[name], ...packed];
        continue;
      }
      value = packed[packed.length - 1];
    } else {
      value = decodeScalar(reader, kind, wireType);
    }
    if (repeated) {
      if (message[name] instanceof Float32Array) message[name] = Array.from(message[name]);
      message[name].push(value);
    } else {
      message[name] = value;
    }
  }
  if (unknown.length) message[UNKNOWN] = unknown;
  return message;
}

// ─── Encoding ───────────────────────────────────────────────────────────────

class Writer {
  constructor() {
    this.chunks = [];
    this.length = 0;
  }

  push(bytes) {
    this.chunks.push(bytes);
    this.length += bytes.length;
  }

  varint(value) {
    if (typeof value === 'bigint') {
      let v = BigInt.asUintN(64, value);
      const out = [];
      while (v >= 0x80n) {
        out.push(Number(v & 0x7fn) | 0x80);
        v >>= 7n;
      }
      out.push(Number(v));
      this.push(Uint8Array.from(out));
      return;
    }
    if (!Number.isSafeInteger(value)) throw new Error(`Cannot encode ${value} as a varint`);
    if (value < 0) {
      this.varint(BigInt(value));
      return;
    }
    const out = [];
    while (value >= 0x80) {
      out.push((value % 0x80) | 0x80);
      value = Math.floor(value / 0x80);
    }
    out.push(value);
    this.push(Uint8Array.from(out));
  }

  tag(fieldNumber, wireType) {
    this.varint((fieldNumber << 3) | wireType);
  }

  lengthDelimited(fieldNumber, bytes) {
    this.tag(fieldNumber, WIRE_LENGTH);
    this.varint(bytes.length);
    this.push(bytes);
  }

  fixed32(value) {
    const b = new Uint8Array(4);
    new DataView(b.buffer).setFloat32(0, value, true);
    this.push(b);
  }

  fixed64(value) {
    const b = new Uint8Array(8);
    new DataView(b.buffer).setFloat64(0, value, true);
    this.push(b);
  }

  finish() {
    const out = new Uint8Array(this.length);
    let offset = 0;
    for (const chunk of this.chunks) {
      out.set(chunk, offset);
      offset += chunk.length;
    }
    return out;
  }
}

function encodeScalar(writer, kind, value) {
  switch (kind) {
    case 'int64':
    case 'uint64':
      writer.varint(value);
      break;
    case 'int32':
    case 'enum':
      writer.varint(value < 0 ? BigInt(value) : value);
      break;
    case 'float':
      writer.fixed32(value);
      break;
    case 'double':
      writer.fixed64(value);
      break;
    default:
      throw new Error(`Not a scalar kind: ${kind}`);
  }
}

const SCALAR_WIRE = {
  int64: WIRE_VARINT,
  uint64: WIRE_VARINT,
  int32: WIRE_VARINT,
  enum: WIRE_VARINT,
  float: WIRE_FIXED32,
  double: WIRE_FIXED64,
};

export function encodeMessage(message, messageName) {
  const schema = SCHEMA[messageName];
  if (!schema) throw new Error(`Unknown message type ${messageName}`);
  const writer = new Writer();
  for (const [numberText, [name, kind, repeated, subMessage, packed]] of Object.entries(schema)) {
    const fieldNumber = Number(numberText);
    const value = message[name];
    if (value === undefined || value === null) continue;
    if (repeated) {
      if (value.length === 0) continue;
      if (kind === 'message') {
        for (const item of value) writer.lengthDelimited(fieldNumber, encodeMessage(item, subMessage));
      } else if (kind === 'string') {
        for (const item of value) writer.lengthDelimited(fieldNumber, textEncoder.encode(item));
      } else if (kind === 'bytes') {
        for (const item of value) writer.lengthDelimited(fieldNumber, item);
      } else if (packed) {
        const body = new Writer();
        for (const item of value) encodeScalar(body, kind, item);
        writer.lengthDelimited(fieldNumber, body.finish());
      } else {
        for (const item of value) {
          writer.tag(fieldNumber, SCALAR_WIRE[kind]);
          encodeScalar(writer, kind, item);
        }
      }
      continue;
    }
    if (kind === 'message') {
      writer.lengthDelimited(fieldNumber, encodeMessage(value, subMessage));
    } else if (kind === 'string') {
      writer.lengthDelimited(fieldNumber, textEncoder.encode(value));
    } else if (kind === 'bytes') {
      writer.lengthDelimited(fieldNumber, value);
    } else {
      // proto3 omits scalar defaults; ONNX writers do too, so an explicit 0 is
      // written only when the decoder saw one (it is then present as 0 here).
      writer.tag(fieldNumber, SCALAR_WIRE[kind]);
      encodeScalar(writer, kind, value);
    }
  }
  for (const { tag, bytes } of message[UNKNOWN] ?? []) {
    writer.varint(tag);
    writer.push(bytes);
  }
  return writer.finish();
}

export function decodeModel(bytes) {
  return decodeMessage(bytes, 'ModelProto');
}

export function encodeModel(model) {
  return encodeMessage(model, 'ModelProto');
}
