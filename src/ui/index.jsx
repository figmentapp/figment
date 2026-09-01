import React from 'react';
import { createRoot } from 'react-dom/client';
import * as g from '../g';
import * as figment from '../figment';
import * as ort from 'onnxruntime-web/all';
import * as mediapipe from '@mediapipe/tasks-vision';
// drawing_utils is a plain global script with no ESM/CJS exports; it defines
// drawConnectors & friends on window, so it must be imported for side effects only.
import '@mediapipe/drawing_utils';
import * as mediabunny from 'mediabunny';

import App from './App';

import { dumpPerformance, clearPerformance } from '../profiling';

window.g = g;
window.figment = figment;
window.profiling = { dumpPerformance, clearPerformance };
window.ort = ort;
window.mediapipe = mediapipe;
window.drawing_utils = {
  clamp: window.clamp,
  drawConnectors: window.drawConnectors,
  drawLandmarks: window.drawLandmarks,
  drawRectangle: window.drawRectangle,
  lerp: window.lerp,
};
window.mediabunny = mediabunny;

// Point ONNX to the public assets folder (works in both dev and prod)
const ortBase = new URL('./onnxruntime-web/', window.location.href).href;
ort.env.wasm.wasmPaths = ortBase;

const params = new URLSearchParams(window.location.search);
const filePath = params.get('filePath');
const renderJob = params.get('render');
if (renderJob) {
  // Headless --render: no editor, the module drives the export loop and exits the app.
  import('./headless-render').then(({ runHeadlessRender }) => runHeadlessRender(JSON.parse(renderJob)));
} else {
  const root = createRoot(document.getElementById('root'));
  root.render(
    <React.StrictMode>
      <App filePath={filePath} />
    </React.StrictMode>,
  );
}
