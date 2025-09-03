import React from 'react';
import { createRoot } from 'react-dom/client';
import * as g from '../g';
import * as figment from '../figment';
import * as THREE from 'three';
import * as tf from '@tensorflow/tfjs';
import * as twgl from 'twgl.js';
import * as ort from 'onnxruntime-web/webgpu';

import App from './App';

window.g = g;
window.THREE = THREE;
window.figment = figment;
window.tf = tf;
window.twgl = twgl;
window.m4 = twgl.m4;
window.ort = ort;
window.DEBUG_ONNX_NODE = true;
// window.DEBUG_BYPASS_ORT = true;
window.DEBUG_ONNX_NODE_FILL = true;

// We need to do this in order for Vite to skip injectQuery.
const ortBase = new URL('./onnxruntime-web/', window.location.href).href;
ort.env.wasm.wasmPaths = ortBase;

async function main() {
  try {
    await figment.initWebGPUDevice();
    // Ensure ORT uses the exact same adapter + device as Figment
    ort.env.webgpu.adapter = window._gpu.adapter;
    ort.env.webgpu.device = window._gpu.device;
  } catch (e) {
    console.error('WebGPU init failed:', e);
  }

  const params = new URLSearchParams(window.location.search);
  const filePath = params.get('filePath');
  const root = createRoot(document.getElementById('root'));
  root.render(
    <React.StrictMode>
      <App filePath={filePath} />
    </React.StrictMode>,
  );
}

main();
