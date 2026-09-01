#!/usr/bin/env python3
"""Convert MediaPipe .task models to ONNX for WebGPU inference.

MediaPipe .task files are ZIP archives (with STORED, uncompressed entries)
containing one or more TFLite models. This script:

  1. Extracts the TFLite models from a .task file.
  2. Densifies sparse weight tensors (pose_detector.tflite stores its conv
     weights in TFLite's sparse CSR format behind DENSIFY ops, which
     tf2onnx cannot parse).
  3. Converts each TFLite model to ONNX with tf2onnx.
  4. Expands PRelu into ops that onnxruntime-web's WebGPU provider runs on
     the GPU (it has no PRelu kernel and would fall back to the CPU).
  5. Validates the ONNX model against the TFLite interpreter on random
     input (max abs difference per output).

The resulting .onnx files can be run in the browser with onnxruntime-web's
WebGPU execution provider, sharing Figment's GPUDevice, so that image
tensors never leave the GPU.

Requirements (conversion is a development-time step, not needed at runtime):
  pip install tensorflow-cpu tf2onnx onnxruntime

Usage:
  python3 scripts/convert-mediapipe-to-onnx.py            # convert pose models
  python3 scripts/convert-mediapipe-to-onnx.py --all      # also hands + face
"""

import argparse
import os
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

# task file -> [(entry inside zip, output onnx name, semantic output names)]
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


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--all', action='store_true', help='also convert hand and face models')
    args = parser.parse_args()

    jobs = POSE_JOBS + (EXTRA_JOBS if args.all else [])
    os.makedirs(OUT_DIR, exist_ok=True)

    with tempfile.TemporaryDirectory() as tmp:
        for task_name, models in jobs:
            task_path = os.path.join(ASSETS, task_name)
            print(f'== {task_name}')
            with zipfile.ZipFile(task_path) as z:
                for entry, onnx_name, semantic_names in models:
                    print(f'-- {entry} -> onnx/{onnx_name}')
                    tflite_path = os.path.join(tmp, f'{task_name}.{entry}')
                    with open(tflite_path, 'wb') as f:
                        f.write(z.read(entry))
                    dense_path = tflite_path + '.dense'
                    if not densify_model(tflite_path, dense_path):
                        dense_path = tflite_path
                    onnx_path = os.path.join(OUT_DIR, onnx_name)
                    convert(dense_path, onnx_path)
                    rename_outputs(onnx_path, semantic_names)
                    # Every op in the graph must have a WebGPU (JSEP) kernel in
                    # onnxruntime-web. An op without one silently runs on the
                    # CPU, with a GPU->CPU->GPU round trip per node, and can
                    # make the model slower than the MediaPipe CPU path. After
                    # converting a new model, load it in Figment and check the
                    # ORT session log for "Some nodes were not assigned to the
                    # preferred execution providers"; rewrite any such op here,
                    # as expand_prelu does for PRelu.
                    expand_prelu(onnx_path)
                    # Validate against the *original* (possibly sparse) model.
                    validate(tflite_path, onnx_path, semantic_names)
    print('done.')


if __name__ == '__main__':
    main()
