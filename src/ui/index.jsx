import React from 'react';
import { createRoot } from 'react-dom/client';
import * as g from '../g';
import * as figment from '../figment';
import * as ort from 'onnxruntime-web/all';
import * as mediapipe from '@mediapipe/tasks-vision';
import * as drawing_utils from '@mediapipe/drawing_utils';
import * as mediabunny from 'mediabunny';

import App from './App';

window.g = g;
window.figment = figment;
window.ort = ort;
window.mediapipe = mediapipe;
window.drawing_utils = drawing_utils;
window.mediabunny = mediabunny;

// Point ONNX to the public assets folder (works in both dev and prod)
const ortBase = new URL('./onnxruntime-web/', window.location.href).href;
ort.env.wasm.wasmPaths = ortBase;

const params = new URLSearchParams(window.location.search);
const filePath = params.get('filePath');
const root = createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    <App filePath={filePath} />
  </React.StrictMode>,
);
