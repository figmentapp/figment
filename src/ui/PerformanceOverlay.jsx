import React, { useEffect, useRef } from 'react';
import { getRollingAvg, getLatest, getTrackedNames, startObserver } from '../profiling';

// A phase row either references a single measure name (`key`) or aggregates
// all `onnx-*:<onnxSuffix>` rings. Aggregation lets the overlay work for any
// ONNX node — built-in `onnxImageModel` (prefix `onnx-image:`), custom
// `onnxLatentModel` (prefix `onnx-latent:`), or future variants — without
// hard-coding each one. Multiple ONNX nodes active at once sum together.
const PHASES = [
  { key: 'frame', label: 'Frame', color: '#888' },
  { key: 'render-all-nodes', label: 'Render All', color: '#6cf' },
  { onnxSuffix: 'preprocess-dispatch', label: 'Pre (GPU→NCHW)', color: '#f90' },
  { onnxSuffix: 'session-run', label: 'ONNX Inference', color: '#f44' },
  { onnxSuffix: 'postprocess-dispatch', label: 'Post (NCHW→GPU)', color: '#4c4' },
];

function phaseAvg(phase) {
  if (phase.key) return getRollingAvg(phase.key, 60);
  let total = 0;
  for (const name of getTrackedNames()) {
    if (name.startsWith('onnx-') && name.endsWith(':' + phase.onnxSuffix)) {
      total += getRollingAvg(name, 60);
    }
  }
  return total;
}

function phaseLatest(phase) {
  if (phase.key) return getLatest(phase.key);
  let total = 0;
  for (const name of getTrackedNames()) {
    if (name.startsWith('onnx-') && name.endsWith(':' + phase.onnxSuffix)) {
      total += getLatest(name);
    }
  }
  return total;
}

const MAX_NODE_ROWS = 5;
const WIDTH = 260;
const HEADER_H = 20;
const ROW_H = 18;
const SECTION_GAP = 6;
const BAR_MAX_W = 120;

export default function PerformanceOverlay() {
  const canvasRef = useRef(null);
  const rafRef = useRef(null);

  useEffect(() => {
    startObserver();

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    const dpr = window.devicePixelRatio || 1;
    let prevHeight = 0;

    function resize(h) {
      if (h === prevHeight) return;
      prevHeight = h;
      canvas.width = WIDTH * dpr;
      canvas.height = h * dpr;
      canvas.style.width = WIDTH + 'px';
      canvas.style.height = h + 'px';
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    function draw() {
      // Collect per-node entries, sort by avg duration descending, take top N.
      // Node measures use the `node-` prefix; ONNX phase measures (which use
      // `onnx-*:`) are surfaced separately by PHASES, so we don't need to
      // exclude them here — `startsWith('node-')` is sufficient.
      const allNames = getTrackedNames();
      const nodeEntries = allNames
        .filter((n) => n.startsWith('node-'))
        .map((name) => ({ key: name, label: name.replace('node-', ''), avg: getRollingAvg(name, 60) }))
        .sort((a, b) => b.avg - a.avg)
        .slice(0, MAX_NODE_ROWS);

      const hasNodes = nodeEntries.length > 0;
      const totalH = HEADER_H + PHASES.length * ROW_H + (hasNodes ? SECTION_GAP + nodeEntries.length * ROW_H : 0) + 4;

      resize(totalH);

      ctx.clearRect(0, 0, WIDTH, totalH);
      ctx.fillStyle = 'rgba(0,0,0,0.75)';
      ctx.fillRect(0, 0, WIDTH, totalH);

      const frameAvg = getRollingAvg('frame', 60);
      const ceil = Math.max(frameAvg, 16);

      ctx.font = '10px monospace';
      ctx.textBaseline = 'middle';

      // Header
      ctx.fillStyle = '#fff';
      ctx.fillText('Performance (avg 60f)', 6, HEADER_H / 2);

      // Draw phase rows
      for (let i = 0; i < PHASES.length; i++) {
        const phase = PHASES[i];
        drawRow(ctx, phaseAvg(phase), phaseLatest(phase), phase.label, phase.color, HEADER_H + i * ROW_H, ceil);
      }

      // Draw top-N node rows
      if (hasNodes) {
        const nodeStartY = HEADER_H + PHASES.length * ROW_H + SECTION_GAP;
        for (let i = 0; i < nodeEntries.length; i++) {
          const entry = nodeEntries[i];
          drawRow(ctx, entry.avg, getLatest(entry.key), entry.label, '#da0', nodeStartY + i * ROW_H, ceil);
        }
      }

      rafRef.current = requestAnimationFrame(draw);
    }

    rafRef.current = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(rafRef.current);
  }, []);

  return (
    <canvas
      ref={canvasRef}
      style={{
        position: 'fixed',
        bottom: '48px',
        left: '4px',
        zIndex: 10000,
        pointerEvents: 'none',
      }}
    />
  );
}

function drawRow(ctx, avg, latest, label, color, y, ceil) {
  // Bar
  const barW = ceil > 0 ? Math.min((avg / ceil) * BAR_MAX_W, BAR_MAX_W) : 0;
  ctx.fillStyle = color;
  ctx.globalAlpha = 0.6;
  ctx.fillRect(6, y, barW, ROW_H - 4);
  ctx.globalAlpha = 1;

  // Label
  ctx.fillStyle = '#fff';
  ctx.fillText(label, 8, y + (ROW_H - 4) / 2);

  // Value
  ctx.fillStyle = '#ccc';
  ctx.fillText(`${avg.toFixed(1)}ms`, BAR_MAX_W + 14, y + (ROW_H - 4) / 2);

  // Latest
  ctx.fillStyle = '#888';
  ctx.fillText(`(${latest.toFixed(1)})`, BAR_MAX_W + 70, y + (ROW_H - 4) / 2);
}
