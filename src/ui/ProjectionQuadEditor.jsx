import React, { useCallback, useMemo, useRef, useState } from 'react';
import { Point, computeAspectFit } from '../g';
import { useAppStore } from './store';

const CORNER_PORTS = ['topLeft', 'topRight', 'bottomRight', 'bottomLeft'];
const DIAGONALS = [
  [0, 2],
  [1, 3],
];
// Top corners blue, bottom corners orange — quick "which way is up" cue on the projector.
const HANDLE_COLORS = ['#5DADE2', '#5DADE2', '#F39C12', '#F39C12'];

// Generous affordance around every visible corner. Off-screen corners get an
// unlimited radius so they stay reachable no matter how far they've been dragged —
// closest-wins ranking still makes visible corners win when nearby.
const HIT_RADIUS = 100;

function isInside(sc, boxW, boxH) {
  return sc.x >= 0 && sc.x <= boxW && sc.y >= 0 && sc.y <= boxH;
}

function findPort(node, name) {
  return node.inPorts.find((p) => p.name === name);
}

function readCorners(node) {
  return CORNER_PORTS.map((name) => {
    const port = findPort(node, name);
    return port ? port.value : new Point(0, 0);
  });
}

function readOutputSize(node) {
  const w = findPort(node, 'outputWidth')?.value ?? 1920;
  const h = findPort(node, 'outputHeight')?.value ?? 1080;
  return { width: w, height: h };
}

function projectorToScreen(pt, fit) {
  return {
    x: fit.offsetX + pt.x * fit.scale,
    y: fit.offsetY + pt.y * fit.scale,
  };
}

/**
 * Interactive quad-corner editor.
 *
 * variant: 'panel' (chrome + background) or 'overlay' (transparent, for use
 * over the fullscreen viewer where the actual rendered image is the backdrop).
 */
export default function ProjectionQuadEditor({ node, width, height, variant = 'panel' }) {
  const changePortValue = useAppStore((s) => s.changePortValue);
  const pushSnapshot = useAppStore((s) => s.pushSnapshot);
  useAppStore((s) => s.version);

  const svgRef = useRef(null);
  const [dragIndex, setDragIndex] = useState(-1);
  // Per-drag baseline so movement stays relative: cornerStart + (mouse - mouseStart).
  const dragStartRef = useRef(null);

  const corners = readCorners(node);
  const { width: projW, height: projH } = readOutputSize(node);
  const fit = useMemo(() => computeAspectFit(width, height, projW, projH), [width, height, projW, projH]);

  const screenCorners = corners.map((c) => projectorToScreen(c, fit));

  const onPointerDown = useCallback(
    (e) => {
      const rect = svgRef.current.getBoundingClientRect();
      const sx = e.clientX - rect.left;
      const sy = e.clientY - rect.top;

      // Closest-corner-within-radius wins. Visible corners use a 100px cap so
      // adjacent affordances don't fight; off-screen corners drop the cap.
      let best = -1;
      let bestDist = Infinity;
      screenCorners.forEach((sc, i) => {
        const radius = isInside(sc, width, height) ? HIT_RADIUS : Infinity;
        const d = Math.hypot(sc.x - sx, sc.y - sy);
        if (d <= radius && d < bestDist) {
          bestDist = d;
          best = i;
        }
      });
      if (best === -1) return;
      e.preventDefault();
      e.stopPropagation();
      pushSnapshot();
      dragStartRef.current = {
        mouseX: sx,
        mouseY: sy,
        cornerX: corners[best].x,
        cornerY: corners[best].y,
      };
      setDragIndex(best);
      svgRef.current.setPointerCapture(e.pointerId);
    },
    [screenCorners, corners, pushSnapshot, width, height],
  );

  const onPointerMove = useCallback(
    (e) => {
      if (dragIndex === -1 || !dragStartRef.current) return;
      const rect = svgRef.current.getBoundingClientRect();
      const sx = e.clientX - rect.left;
      const sy = e.clientY - rect.top;
      const start = dragStartRef.current;
      const dxProj = (sx - start.mouseX) / fit.scale;
      const dyProj = (sy - start.mouseY) / fit.scale;
      changePortValue(node, CORNER_PORTS[dragIndex], new Point(start.cornerX + dxProj, start.cornerY + dyProj));
    },
    [dragIndex, fit, node, changePortValue],
  );

  const onPointerUp = useCallback(
    (e) => {
      if (dragIndex === -1) return;
      setDragIndex(-1);
      dragStartRef.current = null;
      try {
        svgRef.current.releasePointerCapture(e.pointerId);
      } catch (_) {
        // releasePointerCapture throws if the pointer was already released — safe to ignore.
      }
    },
    [dragIndex],
  );

  const polygonPoints = screenCorners.map((s) => `${s.x},${s.y}`).join(' ');
  const isOverlay = variant === 'overlay';
  const stroke = 'rgba(120,180,255,0.95)';
  const fill = 'rgba(120,180,255,0.08)';

  // In overlay variant, defer to CSS (`.projection-quad-overlay` rule) so the
  // hide-cursor !important in fullscreen doesn't fight inline styles.
  const cursor = isOverlay ? undefined : dragIndex !== -1 ? 'grabbing' : 'default';

  return (
    <svg
      ref={svgRef}
      width={width}
      height={height}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      style={{
        touchAction: 'none',
        background: isOverlay ? 'transparent' : '#111',
        cursor,
        userSelect: 'none',
      }}
    >
      <rect
        x={fit.offsetX}
        y={fit.offsetY}
        width={fit.width}
        height={fit.height}
        fill="none"
        stroke={isOverlay ? 'rgba(255,255,255,0.3)' : 'rgba(255,255,255,0.15)'}
        strokeDasharray="4 4"
      />

      <polygon points={polygonPoints} fill={fill} stroke={stroke} strokeWidth="2" />

      {DIAGONALS.map(([a, b]) => (
        <line
          key={`${a}-${b}`}
          x1={screenCorners[a].x}
          y1={screenCorners[a].y}
          x2={screenCorners[b].x}
          y2={screenCorners[b].y}
          stroke={stroke}
          strokeOpacity="0.4"
        />
      ))}

      {screenCorners.map((sc, i) => (
        <circle
          key={i}
          cx={sc.x}
          cy={sc.y}
          r={dragIndex === i ? 9 : 7}
          fill={HANDLE_COLORS[i]}
          stroke="rgba(255,255,255,0.9)"
          strokeWidth="1.5"
        />
      ))}
    </svg>
  );
}
