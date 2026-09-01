import React from 'react';
import { createRoot } from 'react-dom/client';
import * as g from '../g';
import * as figment from '../figment';
import * as ort from 'onnxruntime-web/all';
import * as mediabunny from 'mediabunny';
import { drawConnectors, drawLandmarks } from '../landmark-drawing';

import App from './App';

import { dumpPerformance, clearPerformance } from '../profiling';

window.g = g;
window.figment = figment;
window.profiling = { dumpPerformance, clearPerformance };
window.ort = ort;
// Canvas landmark helpers (the drawing_utils API) for project custom nodes.
window.drawConnectors = drawConnectors;
window.drawLandmarks = drawLandmarks;
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
