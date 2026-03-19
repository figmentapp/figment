/**
 * Performance profiling utilities for Figment.
 *
 * Collects performance.measure() entries emitted by the render loop,
 * Network, and individual nodes (e.g. the ONNX image model node).
 *
 * Usage:
 *   window.figment.dumpPerformance()   — log a stats table to the console
 *   window.figment.clearPerformance()  — clear accumulated measurements
 */

function computeStats(durations) {
  if (durations.length === 0) return null;
  const sorted = [...durations].sort((a, b) => a - b);
  const sum = sorted.reduce((a, b) => a + b, 0);
  const mean = sum / sorted.length;
  const p50 = sorted[Math.floor(sorted.length * 0.5)];
  const p95 = sorted[Math.floor(sorted.length * 0.95)];
  return {
    count: sorted.length,
    mean: mean.toFixed(2),
    min: sorted[0].toFixed(2),
    max: sorted[sorted.length - 1].toFixed(2),
    p50: p50.toFixed(2),
    p95: p95.toFixed(2),
  };
}

/**
 * Collect all performance.measure() entries, group by name,
 * compute stats, and log a formatted table to the console.
 */
export function dumpPerformance() {
  const entries = performance.getEntriesByType('measure');
  if (entries.length === 0) {
    console.log('No performance measurements recorded. Let the project run for a few seconds first.');
    return;
  }

  // Group durations by measure name
  const groups = new Map();
  for (const entry of entries) {
    if (!groups.has(entry.name)) groups.set(entry.name, []);
    groups.get(entry.name).push(entry.duration);
  }

  // Build a table-friendly object
  const table = {};
  // Define a display order for known phases
  const order = [
    'frame',
    'render-all-nodes',
    'onnx-image:preprocess-dispatch',
    'onnx-image:session-run',
    'onnx-image:postprocess-dispatch',
  ];

  const sortedNames = [...groups.keys()].sort((a, b) => {
    const ai = order.indexOf(a);
    const bi = order.indexOf(b);
    if (ai !== -1 && bi !== -1) return ai - bi;
    if (ai !== -1) return -1;
    if (bi !== -1) return 1;
    return a.localeCompare(b);
  });

  for (const name of sortedNames) {
    const stats = computeStats(groups.get(name));
    if (stats) table[name] = stats;
  }

  console.table(table);
  return table;
}

/**
 * Clear all accumulated performance marks and measures.
 */
export function clearPerformance() {
  performance.clearMarks();
  performance.clearMeasures();
  console.log('Performance measurements cleared.');
}

// ── Real-time collection via PerformanceObserver ────────────────────

const RING_SIZE = 120; // frames worth of data

// Ring buffer per measure name: Map<string, number[]>
const ringBuffers = new Map();

function getRing(name) {
  if (!ringBuffers.has(name)) ringBuffers.set(name, []);
  return ringBuffers.get(name);
}

function pushToRing(name, duration) {
  const ring = getRing(name);
  ring.push(duration);
  if (ring.length > RING_SIZE) ring.shift();
}

/**
 * Return rolling average for a given measure name over the last N samples.
 */
export function getRollingAvg(name, n = 60) {
  const ring = ringBuffers.get(name);
  if (!ring || ring.length === 0) return 0;
  const slice = ring.slice(-n);
  return slice.reduce((a, b) => a + b, 0) / slice.length;
}

/**
 * Return the latest value for a given measure name.
 */
export function getLatest(name) {
  const ring = ringBuffers.get(name);
  if (!ring || ring.length === 0) return 0;
  return ring[ring.length - 1];
}

/**
 * Return all tracked measure names that have data.
 */
export function getTrackedNames() {
  return [...ringBuffers.keys()];
}

/**
 * Start the PerformanceObserver that feeds the ring buffers.
 * Safe to call multiple times — only the first call has effect.
 */
let observerStarted = false;
export function startObserver() {
  if (observerStarted) return;
  observerStarted = true;

  const patterns = ['frame', 'render-all-nodes', 'onnx-image:', 'node-'];

  const observer = new PerformanceObserver((list) => {
    for (const entry of list.getEntries()) {
      if (patterns.some((p) => entry.name.startsWith(p) || entry.name === p)) {
        pushToRing(entry.name, entry.duration);
      }
    }
  });

  observer.observe({ type: 'measure', buffered: false });
}
