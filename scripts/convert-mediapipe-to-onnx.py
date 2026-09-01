#!/usr/bin/env python3
# /// script
# requires-python = ">=3.10,<3.13"
# dependencies = ["tensorflow", "tf2onnx", "onnxruntime", "onnx", "flatbuffers", "numpy"]
# ///
"""Convert MediaPipe models to ONNX for WebGPU inference.

MediaPipe .task files are ZIP archives (with STORED, uncompressed entries)
containing one or more TFLite models; the selfie segmenter is a bare
.tflite. This script:

  1. Extracts the TFLite models from a .task file (or reads the .tflite).
  2. Densifies sparse weight tensors (pose_detector.tflite stores its conv
     weights in TFLite's sparse CSR format behind DENSIFY ops, which
     tf2onnx cannot parse).
  3. Replaces MediaPipe's Convolution2DTransposeBias custom op (selfie
     segmenter) with the builtin TRANSPOSE_CONV + ADD, which tf2onnx knows.
  4. Converts each TFLite model to ONNX with tf2onnx.
  5. Expands PRelu and HardSwish into ops that onnxruntime-web's WebGPU
     provider runs on the GPU (it has no kernels for them and would fall
     back to the CPU), then checks every remaining op against the WebGPU
     kernel list in the installed onnxruntime-web.
  6. Validates the ONNX model against the TFLite interpreter on random
     input (max abs difference per output).

The resulting .onnx files can be run in the browser with onnxruntime-web's
WebGPU execution provider, sharing Figment's GPUDevice, so that image
tensors never leave the GPU.

Conversion is a development-time step, not needed at runtime. The inline
script metadata above declares the dependencies, so:

  uv run scripts/convert-mediapipe-to-onnx.py                 # pose models
  uv run scripts/convert-mediapipe-to-onnx.py --all           # + hands, face, segmenter
  uv run scripts/convert-mediapipe-to-onnx.py --only selfie   # one model (substring)
"""

import argparse
import os
import re
import struct
import subprocess
import sys
import tempfile
import zipfile

import numpy as np

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ASSETS = os.path.join(ROOT, 'assets', 'mediapipe')
OUT_DIR = os.path.join(ASSETS, 'onnx')

# tf2onnx names outputs Identity/Identity_1/... in whatever order the TFLite
# graph declares them, which is meaningless at runtime and could shuffle
# across converter versions. MediaPipe itself assigns meaning purely by that
# graph order (SplitTensorVectorCalculator in the task graphs under
# mediapipe/tasks/cc/vision/*), so we bake the semantics in here: after
# conversion the ONNX graph outputs are RENAMED positionally to the names
# below, and src/mediapipe-gpu.js looks them up by name.
DETECTOR_OUTPUTS = ['boxes', 'scores']
POSE_LANDMARK_OUTPUTS = ['landmarks', 'score', 'mask', 'heatmap', 'world_landmarks']
HAND_LANDMARK_OUTPUTS = ['landmarks', 'score', 'handedness', 'world_landmarks']
FACE_LANDMARK_OUTPUTS = ['landmarks', 'score', 'aux']  # 'aux' is unused by Figment
SEGMENTER_OUTPUTS = ['mask']

# model file -> [(entry inside the .task zip, or None for a bare .tflite,
#                 output onnx name, semantic output names)]
POSE_JOBS = [
    ('pose_landmarker_lite.task', [
        ('pose_detector.tflite', 'pose_detector.onnx', DETECTOR_OUTPUTS),
        ('pose_landmarks_detector.tflite', 'pose_landmarks_lite.onnx', POSE_LANDMARK_OUTPUTS),
    ]),
    ('pose_landmarker_full.task', [
        ('pose_landmarks_detector.tflite', 'pose_landmarks_full.onnx', POSE_LANDMARK_OUTPUTS),
    ]),
    ('pose_landmarker_heavy.task', [
        ('pose_landmarks_detector.tflite', 'pose_landmarks_heavy.onnx', POSE_LANDMARK_OUTPUTS),
    ]),
]

EXTRA_JOBS = [
    ('hand_landmarker.task', [
        ('hand_detector.tflite', 'hand_detector.onnx', DETECTOR_OUTPUTS),
        ('hand_landmarks_detector.tflite', 'hand_landmarks_detector.onnx', HAND_LANDMARK_OUTPUTS),
    ]),
    ('face_landmarker.task', [
        ('face_detector.tflite', 'face_detector.onnx', DETECTOR_OUTPUTS),
        ('face_landmarks_detector.tflite', 'face_landmarks_detector.onnx', FACE_LANDMARK_OUTPUTS),
        # face_blendshapes.tflite is not converted: Figment's nodes don't use it.
    ]),
    # The selfie segmenter ships as a bare .tflite (no .task wrapper). Its
    # last op is a LOGISTIC, so the 256×256×1 output is already a
    # probability (SEGMENTER_METADATA activation NONE); the runtime applies
    # no activation.
    ('selfie_segmenter.tflite', [
        (None, 'selfie_segmenter.onnx', SEGMENTER_OUTPUTS),
    ]),
]


# ─── TFLite sparse tensor densification ─────────────────────────────────────
#
# TFLite's sparsity format (https://ai.google.dev/edge/litert) stores a
# tensor as a traversal over dimensions, where each dimension is either
# DENSE (iterate 0..size-1) or SPARSE_CSR (iterate a segment of stored
# indices). Values are stored in traversal order. Dimensions may include
# extra "block" dimensions mapped onto original dimensions via block_map.
# The pose detector only uses per-row CSR over the innermost dim with
# float16 values, but we implement the general scheme.

TFLITE_DTYPES = {0: np.float32, 1: np.float16, 2: np.int32, 3: np.uint8, 9: np.int8}


def _vec(v):
    return None if v is None else np.asarray(v.values)


def densify(sparsity, shape, values):
    trav = list(sparsity.traversalOrder)
    block_map = list(sparsity.blockMap) if sparsity.blockMap is not None else []
    n_orig = len(shape)
    dm = sparsity.dimMetadata

    # Block size for each original dimension (1 if not blocked).
    bsize = [1] * n_orig
    for k, orig_dim in enumerate(block_map):
        tpos = trav.index(n_orig + k)
        bsize[orig_dim] = dm[tpos].denseSize

    dense = np.zeros(shape, dtype=values.dtype)
    idx = [0] * len(trav)
    row_count = [0] * len(trav)
    pos = 0

    segments = [_vec(d.arraySegments) for d in dm]
    indices = [_vec(d.arrayIndices) for d in dm]

    def rec(level):
        nonlocal pos
        if level == len(trav):
            coords = [0] * n_orig
            for t, dim_id in enumerate(trav):
                if dim_id < n_orig:
                    coords[dim_id] += idx[t] * bsize[dim_id]
                else:
                    coords[block_map[dim_id - n_orig]] += idx[t]
            dense[tuple(coords)] = values[pos]
            pos += 1
            return
        d = dm[level]
        if d.format == 0:  # DENSE
            for i in range(d.denseSize):
                idx[level] = i
                rec(level + 1)
        else:  # SPARSE_CSR
            r = row_count[level]
            row_count[level] += 1
            for j in range(int(segments[level][r]), int(segments[level][r + 1])):
                idx[level] = int(indices[level][j])
                rec(level + 1)

    rec(0)
    if pos != len(values):
        raise ValueError(f'densify consumed {pos} of {len(values)} values')
    return dense


def densify_model(tflite_path, out_path):
    """Rewrite a TFLite model, materializing DENSIFY ops into dense buffers."""
    from tensorflow.lite.python import schema_py_generated as schema_fb
    import flatbuffers

    with open(tflite_path, 'rb') as f:
        data = f.read()
    model = schema_fb.ModelT.InitFromObj(schema_fb.Model.GetRootAsModel(data, 0))

    n_densified = 0
    for sg in model.subgraphs:
        keep_ops = []
        for op in sg.operators:
            opcode = model.operatorCodes[op.opcodeIndex]
            code = max(opcode.builtinCode, opcode.deprecatedBuiltinCode)
            if code != schema_fb.BuiltinOperator.DENSIFY:
                keep_ops.append(op)
                continue
            t_in = sg.tensors[op.inputs[0]]
            t_out = sg.tensors[op.outputs[0]]
            dtype = TFLITE_DTYPES[t_in.type]
            raw = model.buffers[t_in.buffer].data
            values = np.frombuffer(bytes(raw), dtype=dtype)
            dense = densify(t_in.sparsity, list(t_in.shape), values)

            buf = schema_fb.BufferT()
            buf.data = np.frombuffer(dense.tobytes(), dtype=np.uint8)
            model.buffers.append(buf)
            t_out.buffer = len(model.buffers) - 1
            # Orphan the sparse tensor so downstream tooling never parses it.
            t_in.buffer = 0
            t_in.sparsity = None
            n_densified += 1
        sg.operators = keep_ops

    if n_densified == 0:
        return False

    builder = flatbuffers.Builder(1024)
    builder.Finish(model.Pack(builder), file_identifier=b'TFL3')
    with open(out_path, 'wb') as f:
        f.write(builder.Output())
    print(f'  densified {n_densified} sparse tensors')
    return True


# ─── MediaPipe custom ops ───────────────────────────────────────────────────
#
# The selfie segmenter's last layer is "Convolution2DTransposeBias", a
# MediaPipe custom op (mediapipe/util/tflite/operations/transpose_conv_bias.cc)
# that predates TFLite's own bias input on TRANSPOSE_CONV. Its inputs are
# (input, weights OHWI, bias) and its custom_options are the raw
# TfLiteTransposeConvParams struct: int32 padding (1 = SAME, 2 = VALID),
# int32 stride_w, int32 stride_h. tf2onnx has no handler for it, so rewrite
# it as builtin TRANSPOSE_CONV(output_shape, weights, input) + ADD(bias).

CUSTOM_TRANSPOSE_CONV_BIAS = 'Convolution2DTransposeBias'


def rewrite_transpose_conv_bias(tflite_path, out_path):
    """Rewrite a TFLite model, replacing Convolution2DTransposeBias ops."""
    from tensorflow.lite.python import schema_py_generated as schema_fb
    import flatbuffers

    with open(tflite_path, 'rb') as f:
        data = f.read()
    model = schema_fb.ModelT.InitFromObj(schema_fb.Model.GetRootAsModel(data, 0))

    def is_custom(op, name):
        opcode = model.operatorCodes[op.opcodeIndex]
        code = max(opcode.builtinCode, opcode.deprecatedBuiltinCode)
        return code == schema_fb.BuiltinOperator.CUSTOM and opcode.customCode == name.encode()

    def opcode_index(builtin):
        for i, opcode in enumerate(model.operatorCodes):
            if max(opcode.builtinCode, opcode.deprecatedBuiltinCode) == builtin and opcode.customCode is None:
                return i
        opcode = schema_fb.OperatorCodeT()
        opcode.builtinCode = builtin
        opcode.deprecatedBuiltinCode = min(builtin, 127)
        opcode.version = 1
        model.operatorCodes.append(opcode)
        return len(model.operatorCodes) - 1

    def add_tensor(sg, name, shape, dtype, data=None):
        buf = schema_fb.BufferT()
        if data is not None:
            buf.data = np.frombuffer(data.tobytes(), dtype=np.uint8)
        model.buffers.append(buf)
        t = schema_fb.TensorT()
        t.name = name.encode()
        t.shape = list(shape)
        t.type = dtype
        t.buffer = len(model.buffers) - 1
        sg.tensors.append(t)
        return len(sg.tensors) - 1

    count = 0
    for sg in model.subgraphs:
        ops = []
        for op in sg.operators:
            if not is_custom(op, CUSTOM_TRANSPOSE_CONV_BIAS):
                ops.append(op)
                continue
            padding, stride_w, stride_h = struct.unpack('<3i', bytes(op.customOptions))
            x, w, b = op.inputs
            (y,) = op.outputs
            out_shape = list(sg.tensors[y].shape)
            name = sg.tensors[y].name.decode()

            shape_t = add_tensor(sg, f'{name}/output_shape', [4], schema_fb.TensorType.INT32, np.array(out_shape, dtype=np.int32))
            conv_t = add_tensor(sg, f'{name}/transpose_conv', out_shape, sg.tensors[y].type)

            conv_opts = schema_fb.TransposeConvOptionsT()
            conv_opts.padding = {1: schema_fb.Padding.SAME, 2: schema_fb.Padding.VALID}[padding]
            conv_opts.strideW = stride_w
            conv_opts.strideH = stride_h
            conv = schema_fb.OperatorT()
            conv.opcodeIndex = opcode_index(schema_fb.BuiltinOperator.TRANSPOSE_CONV)
            conv.inputs = [shape_t, w, x]
            conv.outputs = [conv_t]
            conv.builtinOptionsType = schema_fb.BuiltinOptions.TransposeConvOptions
            conv.builtinOptions = conv_opts

            add = schema_fb.OperatorT()
            add.opcodeIndex = opcode_index(schema_fb.BuiltinOperator.ADD)
            add.inputs = [conv_t, b]
            add.outputs = [y]
            add.builtinOptionsType = schema_fb.BuiltinOptions.AddOptions
            add.builtinOptions = schema_fb.AddOptionsT()

            ops.extend([conv, add])
            count += 1
        sg.operators = ops

    if count == 0:
        return False
    builder = flatbuffers.Builder(1024)
    builder.Finish(model.Pack(builder), file_identifier=b'TFL3')
    with open(out_path, 'wb') as f:
        f.write(builder.Output())
    print(f'  rewrote {count} {CUSTOM_TRANSPOSE_CONV_BIAS} ops as TRANSPOSE_CONV + ADD')
    return True


# ─── Conversion + validation ────────────────────────────────────────────────


def convert(tflite_path, onnx_path):
    subprocess.run(
        [sys.executable, '-m', 'tf2onnx.convert', '--tflite', tflite_path, '--output', onnx_path, '--opset', '17'],
        check=True,
        capture_output=True,
    )


def rename_outputs(onnx_path, semantic_names):
    """Rename the ONNX graph outputs, positionally, to semantic names.

    tf2onnx preserves the TFLite graph's output order, which is the order
    MediaPipe's own graphs rely on, so a positional rename is exactly as
    authoritative as MediaPipe's SplitTensorVectorCalculator indices.
    """
    import onnx

    model = onnx.load(onnx_path)
    if len(model.graph.output) != len(semantic_names):
        raise ValueError(f'{onnx_path}: expected {len(semantic_names)} outputs, found {len(model.graph.output)}')
    mapping = {}
    for out, new_name in zip(model.graph.output, semantic_names):
        mapping[out.name] = new_name
        out.name = new_name
    for node in model.graph.node:
        for i, name in enumerate(node.output):
            if name in mapping:
                node.output[i] = mapping[name]
        for i, name in enumerate(node.input):
            if name in mapping:
                node.input[i] = mapping[name]
    onnx.save(model, onnx_path)


def expand_prelu(onnx_path):
    """Replace every PRelu node with Relu(x) - slope * Relu(-x).

    onnxruntime-web's WebGPU (JSEP) provider has no PRelu kernel, so ORT
    places each PRelu on the CPU provider and pays a GPU->CPU->GPU round
    trip per layer. Relu, Neg, Mul and Sub all have GPU kernels. The slopes
    are per-channel tensors with values outside [0, 1], so the two-op form
    Max(x, slope * x) is not equivalent.
    """
    import onnx
    from onnx import helper

    model = onnx.load(onnx_path)
    nodes = []
    count = 0
    for node in model.graph.node:
        if node.op_type != 'PRelu':
            nodes.append(node)
            continue
        x, slope = node.input
        (y,) = node.output
        base = node.name or y
        pos, neg, neg_relu, scaled = (f'{base}/{s}' for s in ('pos', 'neg', 'neg_relu', 'scaled'))
        nodes.extend(
            [
                helper.make_node('Relu', [x], [pos], name=f'{base}/Relu'),
                helper.make_node('Neg', [x], [neg], name=f'{base}/Neg'),
                helper.make_node('Relu', [neg], [neg_relu], name=f'{base}/Relu_neg'),
                helper.make_node('Mul', [neg_relu, slope], [scaled], name=f'{base}/Mul'),
                helper.make_node('Sub', [pos, scaled], [y], name=f'{base}/Sub'),
            ]
        )
        count += 1
    if count == 0:
        return
    del model.graph.node[:]
    model.graph.node.extend(nodes)
    onnx.checker.check_model(model)
    onnx.save(model, onnx_path)
    print(f'  expanded {count} PRelu nodes')


def expand_hardswish(onnx_path):
    """Replace every HardSwish node with x * HardSigmoid(x, alpha=1/6, beta=0.5).

    That is the definition of HardSwish; onnxruntime-web's WebGPU provider
    has a HardSigmoid kernel but no HardSwish kernel. tf2onnx emits
    HardSwish for the selfie segmenter's MobileNetV3 blocks.
    """
    import onnx
    from onnx import helper

    model = onnx.load(onnx_path)
    nodes = []
    count = 0
    for node in model.graph.node:
        if node.op_type != 'HardSwish':
            nodes.append(node)
            continue
        (x,) = node.input
        (y,) = node.output
        base = node.name or y
        gate = f'{base}/hard_sigmoid'
        nodes.extend(
            [
                helper.make_node('HardSigmoid', [x], [gate], name=f'{base}/HardSigmoid', alpha=1.0 / 6.0, beta=0.5),
                helper.make_node('Mul', [x, gate], [y], name=f'{base}/Mul'),
            ]
        )
        count += 1
    if count == 0:
        return
    del model.graph.node[:]
    model.graph.node.extend(nodes)
    onnx.checker.check_model(model)
    onnx.save(model, onnx_path)
    print(f'  expanded {count} HardSwish nodes')


# Ops that onnxruntime-web's WebGPU provider handles in the wasm engine
# without a WGSL kernel (data stays on the GPU): they don't appear in the
# JS kernel table below.
WEBGPU_PASSTHROUGH_OPS = {'Constant', 'Flatten', 'Identity', 'Reshape', 'Shape', 'Squeeze', 'Unsqueeze'}


def webgpu_ops():
    """Op types with a WebGPU kernel in the installed onnxruntime-web.

    Read from the op-resolve table in onnxruntime-web's JS bundle (the
    WebGPU provider implements its kernels in JS/WGSL). Returns None when
    node_modules is not installed.
    """
    bundle = os.path.join(ROOT, 'node_modules', 'onnxruntime-web', 'dist', 'ort.all.mjs')
    if not os.path.exists(bundle):
        return None
    with open(bundle, encoding='utf-8') as f:
        source = f.read()
    return set(re.findall(r'\["([A-Z][A-Za-z0-9]+)",\s*\[', source)) | WEBGPU_PASSTHROUGH_OPS


def check_webgpu_ops(onnx_path, supported):
    """Fail on any op the WebGPU provider would hand to the CPU provider.

    Such an op costs a GPU->CPU->GPU round trip per node and can make the
    model slower than MediaPipe's own CPU path. Rewrite it in this script
    (as expand_prelu / expand_hardswish do) rather than shipping the model.
    ORT's session log ("Some nodes were not assigned to the preferred
    execution providers") is the runtime counterpart of this check.
    """
    import onnx

    model = onnx.load(onnx_path)
    unsupported = sorted({n.op_type for n in model.graph.node} - supported)
    if unsupported:
        raise ValueError(f'{os.path.basename(onnx_path)}: no WebGPU kernel for {", ".join(unsupported)}')


def validate(tflite_path, onnx_path, semantic_names):
    """Compare TFLite interpreter and onnxruntime outputs on random input.

    Outputs are compared positionally (TFLite graph order vs ONNX graph
    order) since the ONNX outputs have been renamed to semantic names.
    """
    import tensorflow as tf
    import onnxruntime as rt

    interp = tf.lite.Interpreter(model_path=tflite_path)
    interp.allocate_tensors()
    in_det = interp.get_input_details()[0]
    rng = np.random.default_rng(42)
    x = rng.random(in_det['shape'], dtype=np.float32) * 2.0 - 1.0
    interp.set_tensor(in_det['index'], x)
    interp.invoke()
    tfl_out = [interp.get_tensor(d['index']) for d in interp.get_output_details()]

    sess = rt.InferenceSession(onnx_path, providers=['CPUExecutionProvider'])
    input_name = sess.get_inputs()[0].name
    onnx_names = [o.name for o in sess.get_outputs()]
    if onnx_names != list(semantic_names):
        raise ValueError(f'output rename failed: {onnx_names} != {semantic_names}')
    onnx_by_name = dict(zip(onnx_names, sess.run(None, {input_name: x})))
    if len(tfl_out) != len(onnx_names):
        raise ValueError(f'output count mismatch: TFLite {len(tfl_out)} vs ONNX {len(onnx_names)}')

    # The models use float16 weights, so exact equality is impossible. We
    # compare the max abs difference relative to the output's magnitude:
    # e.g. segmentation logits span roughly ±550, and a 0.1 absolute
    # difference there is ~1e-4 relative (and <1e-3 after sigmoid).
    worst = 0.0
    for name, ref in zip(semantic_names, tfl_out):
        out = onnx_by_name[name]
        diff = float(np.max(np.abs(ref - out.reshape(ref.shape))))
        rel = diff / max(1.0, float(np.max(np.abs(ref))))
        worst = max(worst, rel)
        print(f'  {name}: shape {list(ref.shape)}, max abs diff {diff:.2e} (rel {rel:.2e})')
    if worst > 1e-2:
        raise ValueError(f'validation failed: max relative diff {worst:.2e} > 1e-2')


def read_model(container_path, entry):
    """Bytes of a TFLite model: an entry of a .task zip, or the file itself."""
    if entry is None:
        with open(container_path, 'rb') as f:
            return f.read()
    with zipfile.ZipFile(container_path) as z:
        return z.read(entry)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--all', action='store_true', help='also convert the hand, face and segmenter models')
    parser.add_argument('--only', metavar='NAME', help='convert only the models whose output name contains NAME')
    args = parser.parse_args()

    jobs = POSE_JOBS + (EXTRA_JOBS if args.all or args.only else [])
    supported_ops = webgpu_ops()
    if supported_ops is None:
        print('warning: node_modules/onnxruntime-web not found, skipping the WebGPU op check')
    os.makedirs(OUT_DIR, exist_ok=True)

    with tempfile.TemporaryDirectory() as tmp:
        for container_name, models in jobs:
            models = [m for m in models if not args.only or args.only in m[1]]
            if not models:
                continue
            container_path = os.path.join(ASSETS, container_name)
            print(f'== {container_name}')
            for entry, onnx_name, semantic_names in models:
                print(f'-- {entry or container_name} -> onnx/{onnx_name}')
                tflite_path = os.path.join(tmp, f'{container_name}.{entry or "tflite"}')
                with open(tflite_path, 'wb') as f:
                    f.write(read_model(container_path, entry))
                # Rewrite what tf2onnx cannot parse; each step reads the
                # previous step's file.
                source_path = tflite_path
                for suffix, rewrite in (('.dense', densify_model), ('.builtin', rewrite_transpose_conv_bias)):
                    if rewrite(source_path, source_path + suffix):
                        source_path = source_path + suffix
                onnx_path = os.path.join(OUT_DIR, onnx_name)
                convert(source_path, onnx_path)
                rename_outputs(onnx_path, semantic_names)
                expand_prelu(onnx_path)
                expand_hardswish(onnx_path)
                if supported_ops is not None:
                    check_webgpu_ops(onnx_path, supported_ops)
                # Validate against the *original* model.
                validate(tflite_path, onnx_path, semantic_names)
    print('done.')


if __name__ == '__main__':
    main()
