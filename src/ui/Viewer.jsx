import React, { useEffect, useRef, useState } from 'react';
import * as figment from '../figment';
import { useAppStore } from './store';
import { shouldRedrawViewer } from './viewer-state';
import ProjectionQuadEditor from './ProjectionQuadEditor';

export default function Viewer() {
  const network = useAppStore((s) => s.network);
  const fullscreen = useAppStore((s) => s.fullscreen);
  useAppStore((s) => s.version); // re-render overlays on port changes
  const canvasRef = useRef(null);
  const blitterRef = useRef(null);
  const shouldDrawRef = useRef(false);
  const [letterbox, setLetterbox] = useState(null);

  const draw = () => {
    const canvas = canvasRef.current;
    const blitter = blitterRef.current;
    if (!figment.getDevice() || !canvas || !blitter) return;

    const parent = canvas.parentElement;
    if (canvas.width !== parent.clientWidth || canvas.height !== parent.clientHeight) {
      canvas.width = parent.clientWidth;
      canvas.height = parent.clientHeight;
    }

    const outNode = network.nodes.find((n) => n.type === 'core.out');
    let outPort;
    if (outNode) {
      outPort = outNode.outPorts[0];
    } else {
      outPort = {};
    }

    if (!outPort.value || !outPort.value.texture) return;

    const fit = blitter.draw(outPort.value, 'contain');
    if (!fit) return;

    setLetterbox((prev) => {
      if (prev && prev.offsetX === fit.offsetX && prev.offsetY === fit.offsetY && prev.width === fit.width && prev.height === fit.height) {
        return prev;
      }
      return { offsetX: fit.offsetX, offsetY: fit.offsetY, width: fit.width, height: fit.height };
    });
  };

  const onNetworkChange = () => {
    shouldDrawRef.current = true;
  };

  const rafIdRef = useRef(0);
  const animate = () => {
    if (shouldDrawRef.current) {
      draw();
      shouldDrawRef.current = false;
    }
    rafIdRef.current = window.requestAnimationFrame(animate);
  };

  useEffect(() => {
    const device = figment.getDevice();
    if (!device || !canvasRef.current) return;

    blitterRef.current = figment.createCanvasBlitter(canvasRef.current, { label: 'viewer blit' });

    const initialNetwork = useAppStore.getState().network;
    initialNetwork.addChangeListener(onNetworkChange);
    shouldDrawRef.current = true;
    animate();

    let currentNetwork = initialNetwork;
    const unsubscribe = useAppStore.subscribe((state, prevState) => {
      if (shouldRedrawViewer(state, prevState)) {
        shouldDrawRef.current = true;
      }
      if (state.network !== prevState.network) {
        if (currentNetwork !== state.network) {
          currentNetwork.removeChangeListener(onNetworkChange);
          state.network.addChangeListener(onNetworkChange);
          currentNetwork = state.network;
        }
      }
    });

    return () => {
      cancelAnimationFrame(rafIdRef.current);
      currentNetwork.removeChangeListener(onNetworkChange);
      unsubscribe();
      blitterRef.current?.destroy();
      blitterRef.current = null;
    };
  }, []);

  const projectionNodes = fullscreen
    ? network.nodes.filter((n) => {
        if (n.type !== 'image.projectionQuad') return false;
        const showUIPort = n.inPorts.find((p) => p.name === 'showUI');
        return showUIPort ? showUIPort.value : true;
      })
    : [];

  return (
    <div className="fixed inset-0 overflow-hidden bg-black">
      <canvas ref={canvasRef}></canvas>
      {letterbox &&
        projectionNodes.map((node) => (
          <div
            key={node.id}
            className="projection-quad-overlay"
            style={{
              position: 'absolute',
              left: letterbox.offsetX,
              top: letterbox.offsetY,
              width: letterbox.width,
              height: letterbox.height,
              pointerEvents: 'auto',
            }}
          >
            <ProjectionQuadEditor node={node} width={letterbox.width} height={letterbox.height} variant="overlay" />
          </div>
        ))}
    </div>
  );
}
