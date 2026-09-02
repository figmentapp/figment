import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { decodeModel, encodeModel, decodeMessage, encodeMessage, DataType } from './proto.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const fixture = (name) => new Uint8Array(fs.readFileSync(path.join(here, 'fixtures', name)));

describe('ONNX protobuf codec', () => {
  it.each(['unet-mini.onnx', 'stylegan-mini.onnx'])('round-trips %s byte for byte', (name) => {
    const bytes = fixture(name);
    const model = decodeModel(bytes);
    expect(model.irVersion).toBe(8);
    expect(model.opsetImport[0].version).toBe(17);
    expect(model.graph.node.length).toBeGreaterThan(5);
    expect(encodeModel(model)).toEqual(bytes);
  });

  it('reads nodes, attributes and tensors the converter needs', () => {
    const bytes = fixture('unet-mini.onnx');
    const model = decodeModel(bytes);
    const graph = model.graph;
    const conv = graph.node.find((n) => n.opType === 'Conv');
    expect(conv.input).toEqual(['input', 'w1']);
    const strides = conv.attribute.find((a) => a.name === 'strides');
    expect(strides.ints).toEqual([2, 2]);
    const alpha = graph.node.find((n) => n.opType === 'LeakyRelu').attribute[0];
    expect(alpha.f).toBeCloseTo(0.2);
    const w1 = graph.initializer.find((t) => t.name === 'w1');
    expect(w1.dims).toEqual([8, 3, 4, 4]);
    expect(w1.dataType).toBe(DataType.FLOAT);
    expect(w1.rawData.byteLength).toBe(8 * 3 * 4 * 4 * 4);
    // raw_data is a view into the file, not a copy
    expect(w1.rawData.buffer).toBe(bytes.buffer);
    expect(graph.input[0].type.tensorType.shape.dim.map((d) => d.dimParam ?? d.dimValue)).toEqual(['batch', 3, 16, 16]);
  });

  it('keeps int64 extremes and negative values', () => {
    const tensor = { dims: [3], dataType: DataType.INT64, int64Data: [-1, 2 ** 53 - 1, 9223372036854775807n], name: 'ends' };
    const bytes = encodeMessage(tensor, 'TensorProto');
    const back = decodeMessage(bytes, 'TensorProto');
    expect(back.int64Data).toEqual([-1, 2 ** 53 - 1, 9223372036854775807n]);
    expect(encodeMessage(back, 'TensorProto')).toEqual(bytes);
  });

  it('preserves fields it does not know', () => {
    // ModelProto field 20 (training_info) is not in the schema.
    const known = encodeMessage({ irVersion: 8, producerName: 'x' }, 'ModelProto');
    // tag (20 << 3) | 2 = 162, a two-byte varint
    const unknownField = Uint8Array.from([0xa2, 0x01, 3, 1, 2, 3]);
    const bytes = new Uint8Array([...known, ...unknownField]);
    const model = decodeMessage(bytes, 'ModelProto');
    expect(model.producerName).toBe('x');
    expect(encodeMessage(model, 'ModelProto')).toEqual(bytes);
  });
});
