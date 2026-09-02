import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as ort from 'onnxruntime-web';
import { convertModel, describeModel } from './convert.js';
import { decodeModel, encodeModel, DataType } from './proto.js';
import { getAttribute } from './graph.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const fixture = (name) => new Uint8Array(fs.readFileSync(path.join(here, 'fixtures', name)));

// onnxruntime-web's CPU (wasm) provider is the numerical oracle: it runs both
// the original and the converted model on the same input.
async function run(bytes, input, dims) {
  const session = await ort.InferenceSession.create(bytes, { executionProviders: ['wasm'] });
  const result = await session.run({ input: new ort.Tensor('float32', input, dims) });
  const output = result[session.outputNames[0]].data;
  await session.release();
  return Float32Array.from(output);
}

function randomInput(count, seed = 1) {
  let s = seed;
  return Float32Array.from({ length: count }, () => {
    s = (s * 1103515245 + 12345) % 2 ** 31;
    return (s / 2 ** 31) * 2 - 1;
  });
}

function maxAbsDiff(a, b) {
  expect(a.length).toBe(b.length);
  let max = 0;
  for (let i = 0; i < a.length; i++) max = Math.max(max, Math.abs(a[i] - b[i]));
  return max;
}

describe('describeModel', () => {
  it('summarizes a model', () => {
    const info = describeModel(fixture('unet-mini.onnx'));
    expect(info.opset).toBe(17);
    expect(info.ops.ConvTranspose).toBe(2);
    expect(info.inputs[0]).toEqual({ name: 'input', elemType: DataType.FLOAT, shape: ['batch', 3, 16, 16] });
    expect(info.initializerBytes).toBeGreaterThan(20000);
  });
});

describe('ConvTranspose rewrite', () => {
  it('replaces stride-2 4x4 ConvTranspose with Conv + DepthToSpace and matches the original', async () => {
    const original = fixture('unet-mini.onnx');
    const { bytes, report } = convertModel(original, { fp16: false });
    expect(report.convTranspose).toEqual({ rewritten: 2, kept: 0 });
    // 16 output channels: four 2x2 convs on padded input; 3 output channels: one 3x3 conv.
    expect(report.after.ops.ConvTranspose).toBeUndefined();
    expect(report.after.ops.Conv).toBe(2 + 4 + 1);
    expect(report.after.ops.Pad).toBe(4);
    expect(report.after.ops.DepthToSpace).toBe(2);

    const input = randomInput(3 * 16 * 16);
    const a = await run(original, input, [1, 3, 16, 16]);
    const b = await run(bytes, input, [1, 3, 16, 16]);
    expect(maxAbsDiff(a, b)).toBeLessThan(1e-5);
  });

  it('leaves other ConvTranspose shapes alone', () => {
    const model = decodeModel(fixture('unet-mini.onnx'));
    // Pretend the first ConvTranspose has stride 1.
    const node = model.graph.node.find((n) => n.opType === 'ConvTranspose');
    node.attribute.find((a) => a.name === 'strides').ints = [1, 1];
    const { report } = convertModel(encodeModel(model), { fp16: false });
    expect(report.convTranspose).toEqual({ rewritten: 1, kept: 1 });
  });
});

describe('constant folding', () => {
  it('folds the demodulation chain into a per-channel constant and drops what it read', async () => {
    const original = fixture('stylegan-mini.onnx');
    const { bytes, report } = convertModel(original, { fp16: false, convTranspose: false });
    // Mul, Mul, ReduceSum, Sqrt, Div, Unsqueeze: six nodes, leaving Mul(c, demod) with a constant.
    expect(report.fold.nodesFolded).toBe(6);
    expect(report.after.ops.ReduceSum).toBeUndefined();
    expect(report.after.ops.Sqrt).toBeUndefined();
    expect(report.after.ops.Mul).toBe(1);
    // 'style' and the intermediate constants are gone; 'w' stays for the Conv.
    const names = decodeModel(bytes).graph.initializer.map((t) => t.name);
    expect(names).toContain('w');
    expect(names).not.toContain('style');
    const input = randomInput(4 * 8 * 8, 7);
    const a = await run(original, input, [1, 4, 8, 8]);
    const b = await run(bytes, input, [1, 4, 8, 8]);
    expect(maxAbsDiff(a, b)).toBeLessThan(1e-5);
  });
});

describe('float16 conversion', () => {
  it('halves the weights, keeps float32 inputs and outputs, and stays close to the original', async () => {
    const original = fixture('unet-mini.onnx');
    const { bytes, report } = convertModel(original, { convTranspose: false });
    expect(report.fold.nodesFolded).toBe(0);
    expect(report.fp16.initializersConverted).toBe(9);
    expect(report.bytes.after).toBeLessThan(report.bytes.before * 0.6);
    const model = decodeModel(bytes);
    expect(model.graph.input[0].type.tensorType.elemType).toBe(DataType.FLOAT);
    expect(model.graph.output[0].type.tensorType.elemType).toBe(DataType.FLOAT);
    expect(model.graph.initializer.every((t) => t.dataType === DataType.FLOAT16)).toBe(true);
    expect(report.after.ops.Cast).toBe(2);

    const input = randomInput(3 * 16 * 16);
    const a = await run(original, input, [1, 3, 16, 16]);
    const b = await run(bytes, input, [1, 3, 16, 16]);
    expect(maxAbsDiff(a, b)).toBeLessThan(0.02);
  });

  it('removes no-op casts, keeps reductions and Resize scales in float32', async () => {
    const original = fixture('stylegan-mini.onnx');
    // Folding off: the demodulation chain stays and shows the blocked-op handling.
    const { bytes, report } = convertModel(original, { fold: false });
    expect(report.fp16.castsRemoved).toBe(2);
    expect(report.fp16.blockedNodes).toBe(1);
    const model = decodeModel(bytes);
    const graph = model.graph;
    const initializer = (name) => graph.initializer.find((t) => t.name === name);
    expect(initializer('scales').dataType).toBe(DataType.FLOAT);
    expect(initializer('w').dataType).toBe(DataType.FLOAT16);
    // The demodulation chain feeds ReduceSum: its inputs arrive as float32
    // through a Cast, its output goes back to float16 through another.
    const reduce = graph.node.find((n) => n.opType === 'ReduceSum');
    const producerOf = (name) => graph.node.find((n) => n.output.includes(name));
    expect(producerOf(reduce.input[0]).opType).toBe('Cast');
    expect(Number(getAttribute(producerOf(reduce.input[0]), 'to'))).toBe(DataType.FLOAT);
    const consumerOfReduce = graph.node.find((n) => n.input.includes(reduce.output[0]));
    expect(consumerOfReduce.opType).toBe('Cast');
    expect(Number(getAttribute(consumerOfReduce, 'to'))).toBe(DataType.FLOAT16);
    expect(
      graph.node.filter((n) => n.opType === 'Cast' && Number(getAttribute(n, 'to')) === DataType.FLOAT && n.input[0] === 'input'),
    ).toHaveLength(0);

    const input = randomInput(4 * 8 * 8, 7);
    const a = await run(original, input, [1, 4, 8, 8]);
    const b = await run(bytes, input, [1, 4, 8, 8]);
    expect(maxAbsDiff(a, b)).toBeLessThan(0.02);
  });
});
