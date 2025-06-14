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
window.ort.env.wasm.wasmPaths = '/onnxruntime-web/';

const params = new URLSearchParams(window.location.search);
const filePath = params.get('filePath');
const root = createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    <App filePath={filePath} />
  </React.StrictMode>,
);
