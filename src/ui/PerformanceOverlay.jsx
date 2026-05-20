import React, { useEffect, useRef } from 'react';
import { getRollingAvg, getLatest, getTrackedNames, startObserver } from '../profiling';

const PHASES = [
  { key: 'frame', label: 'Frame', color: '#888' },
  { key: 'render-all-nodes', label: 'Render All', color: '#6cf' },
  { key: 'onnx-image:preprocess-dispatch', label: 'Pre (GPU→NCHW)', color: '#f90' },
  { key: 'onnx-image:session-run', label: 'ONNX Inference', color: '#f44' },
  { key: 'onnx-image:postprocess-dispatch', label: 'Post (NCHW→GPU)', color: '#4c4' },
];

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
      // Collect per-node entries, sort by avg duration descending, take top N
      const allNames = getTrackedNames();
      const phaseKeys = new Set(PHASES.map((p) => p.key));
      const nodeEntries = allNames
        .filter((n) => n.startsWith('node-') && !phaseKeys.has(n))
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
        drawRow(ctx, PHASES[i].key, PHASES[i].label, PHASES[i].color, HEADER_H + i * ROW_H, ceil);
      }

      // Draw top-N node rows
      if (hasNodes) {
        const nodeStartY = HEADER_H + PHASES.length * ROW_H + SECTION_GAP;
        for (let i = 0; i < nodeEntries.length; i++) {
          drawRow(ctx, nodeEntries[i].key, nodeEntries[i].label, '#da0', nodeStartY + i * ROW_H, ceil);
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

function drawRow(ctx, key, label, color, y, ceil) {
  const avg = getRollingAvg(key, 60);
  const latest = getLatest(key);

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
