import { describe, expect, it } from 'vitest';
import { analyze } from './check-onnx-webgpu.mjs';

// Session log lines as onnxruntime-web 1.25 prints them (timestamps trimmed).
const allOnWebGpu = [
  '[I:onnxruntime:, graph_transformer.cc:15 Apply] GraphTransformer MemcpyTransformer modified: 0 with status: OK',
  '[V:onnxruntime:, session_state.cc:1342 VerifyEachNodeIsAssignedToAnEp]  All nodes placed on [JsExecutionProvider]. Number of nodes: 52',
];

const preluInTheMiddle = [
  '[I:onnxruntime:, js_execution_provider.cc:817 GetCapability] webgpu kernel not found in registries for Op type: PRelu node name: /1/PRelu',
  '[I:onnxruntime:, transformer_memcpy.cc:393 AddCopyNode] Add MemcpyFromHost after /1/PRelu for JsExecutionProvider',
  '[I:onnxruntime:, transformer_memcpy.cc:393 AddCopyNode] Add MemcpyToHost before /0/Conv for CPUExecutionProvider',
  '[I:onnxruntime:, graph_transformer.cc:15 Apply] GraphTransformer MemcpyTransformer modified: 1 with status: OK',
  '[V:onnxruntime:, session_state.cc:1345 VerifyEachNodeIsAssignedToAnEp]  Node(s) placed on [JsExecutionProvider]. Number of nodes: 6',
  '[V:onnxruntime:, session_state.cc:1347 VerifyEachNodeIsAssignedToAnEp]   MemcpyFromHost (Memcpy)',
  '[V:onnxruntime:, session_state.cc:1345 VerifyEachNodeIsAssignedToAnEp]  Node(s) placed on [CPUExecutionProvider]. Number of nodes: 1',
  '[W:onnxruntime:, session_state.cc:1359 VerifyEachNodeIsAssignedToAnEp] Some nodes were not assigned to the preferred execution providers which may or may not have an negative impact on performance.',
];

// A Gather on the output of Shape: ORT keeps shape math on the CPU and
// inserts no copies, so the activations never leave the GPU.
const shapeOpOnCpu = [
  '[I:onnxruntime:, js_execution_provider.cc:817 GetCapability] webgpu kernel not found in registries for Op type: Gather node name: Gather',
  '[I:onnxruntime:, graph_transformer.cc:15 Apply] GraphTransformer MemcpyTransformer modified: 0 with status: OK',
  '[V:onnxruntime:, session_state.cc:1345 VerifyEachNodeIsAssignedToAnEp]  Node(s) placed on [CPUExecutionProvider]. Number of nodes: 1',
  '[V:onnxruntime:, session_state.cc:1345 VerifyEachNodeIsAssignedToAnEp]  Node(s) placed on [JsExecutionProvider]. Number of nodes: 11',
];

const allOnCpu = [
  '[I:onnxruntime:, js_execution_provider.cc:817 GetCapability] webgpu kernel not found in registries for Op type: PRelu node name: /PRelu',
  '[I:onnxruntime:, graph_transformer.cc:15 Apply] GraphTransformer MemcpyTransformer modified: 0 with status: OK',
  '[V:onnxruntime:, session_state.cc:1342 VerifyEachNodeIsAssignedToAnEp]  All nodes placed on [CPUExecutionProvider]. Number of nodes: 1',
];

describe('analyze', () => {
  it('passes a model with every node on the WebGPU provider', () => {
    const report = analyze(allOnWebGpu);
    expect(report.failed).toBe(false);
    expect(report.lines).toEqual(['OK, all 52 nodes on WebGPU']);
  });

  it('fails a model whose CPU node forces Memcpy nodes, naming the op and the copies', () => {
    const report = analyze(preluInTheMiddle);
    expect(report.failed).toBe(true);
    expect(report.lines[0]).toBe('FAIL, 6 nodes on WebGPU, 1 on the CPU, 2 GPU↔CPU copies per run');
    expect(report.lines).toContain('  ops without a WebGPU kernel: PRelu (/1/PRelu)');
    expect(report.lines).toContain('  copy: MemcpyFromHost /1/PRelu');
    expect(report.lines).toContain('  copy: MemcpyToHost /0/Conv');
  });

  it('passes shape-only CPU nodes that need no copies', () => {
    const report = analyze(shapeOpOnCpu);
    expect(report.failed).toBe(false);
    expect(report.lines[0]).toBe('OK, 11 nodes on WebGPU, 1 shape-only nodes on the CPU (no GPU↔CPU copies)');
    expect(report.lines).toContain('  ops without a WebGPU kernel: Gather (Gather)');
  });

  it('fails a model that runs entirely on the CPU', () => {
    const report = analyze(allOnCpu);
    expect(report.failed).toBe(true);
    expect(report.lines[0]).toBe('FAIL, 0 nodes on WebGPU, 0 on the CPU, 0 GPU↔CPU copies per run');
  });
});
