import React, { useEffect, useRef } from 'react';
import * as twgl from 'twgl.js';
import { useAppStore } from './store';

const NODE_WIDTH = 100;
const NODE_HEIGHT = 56;

const VERTEX_SHADER = `
uniform vec2 u_scale;
attribute vec2 a_position;
attribute vec2 a_uv;
varying vec2 v_uv;
void main() {
  v_uv = a_uv;
  vec2 pos = a_position;
  // Convert position from 0.0-1.0 to -1.0-1.0
  pos = pos * 2.0 - 1.0;
  pos.y = -pos.y;
  pos *= u_scale;
  gl_Position = vec4(pos, 0.0, 1.0);
}
`;

const FRAGMENT_SHADER = `
precision mediump float;
uniform sampler2D u_texture;
uniform vec4 u_color;
varying vec2 v_uv;
void main() {
  gl_FragColor = u_color * texture2D(u_texture, v_uv);
}
`;

export default function Viewer({ offscreenCanvas }) {
  const network = useAppStore((s) => s.network);

  const previewCanvasRef = useRef(null);
  const glRef = useRef(null);
  const programInfoRef = useRef(null);
  const defaultTextureRef = useRef(null);
  const nodeRectBufferInfoRef = useRef(null);
  const shouldDrawRef = useRef(false);

  const draw = () => {
    const gl = glRef.current;
    const canvas = offscreenCanvas;
    const previewCanvas = previewCanvasRef.current;
    if (!gl || !previewCanvas) return;

    const parent = previewCanvas.parentElement;
    if (canvas.width !== parent.clientWidth || canvas.height !== parent.clientHeight) {
      canvas.width = parent.clientWidth;
      canvas.height = parent.clientHeight;
      previewCanvas.width = parent.clientWidth;
      previewCanvas.height = parent.clientHeight;
    }
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.clearColor(0, 0, 0, 1.0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

    const outNode = network.nodes.find((n) => n.type === 'core.out');
    let outPort;
    if (outNode) {
      outPort = outNode.outPorts[0];
    } else {
      outPort = {};
    }

    let nodeColor = [1, 0, 1, 1];
    let texture, textureWidth, textureHeight;
    if (outPort.value && outPort.value._fbo) {
      nodeColor = [1, 1, 1, 1];
      texture = outPort.value._fbo.attachments[0];
      textureWidth = outPort.value.width;
      textureHeight = outPort.value.height;
    } else {
      texture = defaultTextureRef.current;
      textureWidth = NODE_WIDTH;
      textureHeight = NODE_HEIGHT;
    }

    const textureRatio = textureWidth / textureHeight;
    const canvasRatio = canvas.width / canvas.height;
    let u_scale;

    if (textureRatio > canvasRatio) {
      // The texture is wider than the canvas
      const scaleFactor = canvasRatio / textureRatio;
      u_scale = [1.0, scaleFactor];
    } else {
      // The texture is taller than the canvas
      const scaleFactor = textureRatio / canvasRatio;
      u_scale = [scaleFactor, 1.0];
    }

    twgl.bindFramebufferInfo(gl, null);
    gl.useProgram(programInfoRef.current.program);
    twgl.setBuffersAndAttributes(gl, programInfoRef.current, nodeRectBufferInfoRef.current);
    twgl.setUniforms(programInfoRef.current, {
      u_texture: texture,
      u_color: nodeColor,
      u_viewport: [canvas.width, canvas.height],
      u_resolution: [textureWidth, textureHeight],
      u_scale: u_scale,
    });
    twgl.drawBufferInfo(gl, nodeRectBufferInfoRef.current);

    // Draw the offscreen canvas on the preview canvas.
    const previewContext = previewCanvas.getContext('bitmaprenderer');
    const bitmap = canvas.transferToImageBitmap();
    previewContext.transferFromImageBitmap(bitmap);
  };

  const onNetworkChange = () => {
    shouldDrawRef.current = true;
  };

  const animate = () => {
    if (shouldDrawRef.current) {
      draw();
      shouldDrawRef.current = false;
    }
    window.requestAnimationFrame(animate);
  };

  useEffect(() => {
    const gl = offscreenCanvas.getContext('webgl');
    glRef.current = gl;
    programInfoRef.current = twgl.createProgramInfo(gl, [VERTEX_SHADER, FRAGMENT_SHADER]);

    // Create a default checkerboard texture.
    const checkerTexture = {
      mag: gl.NEAREST,
      min: gl.LINEAR,
      src: [255, 255, 255, 255, 192, 192, 192, 255, 192, 192, 192, 255, 255, 255, 255, 255],
    };
    defaultTextureRef.current = twgl.createTexture(gl, checkerTexture);

    // Create a buffer for a node rectangle.
    let x0 = 0;
    let x1 = 1;
    let y0 = 0;
    let y1 = 1;
    const arrays = {
      a_position: { numComponents: 2, data: [x0, y0, x0, y1, x1, y1, x1, y0] },
      a_uv: { numComponents: 2, data: [0, 0, 0, 1, 1, 1, 1, 0] },
      indices: [0, 1, 2, 0, 2, 3],
    };
    nodeRectBufferInfoRef.current = twgl.createBufferInfoFromArrays(gl, arrays);

    // Listen for network changes.
    const initialNetwork = useAppStore.getState().network;
    initialNetwork.addChangeListener(onNetworkChange);
    animate();

    // Subscribe to network changes from Zustand
    let currentNetwork = initialNetwork;
    const unsubscribe = useAppStore.subscribe((state, prevState) => {
      if (state.network !== prevState.network) {
        if (currentNetwork !== state.network) {
          currentNetwork.removeChangeListener(onNetworkChange);
          state.network.addChangeListener(onNetworkChange);
          currentNetwork = state.network;
        }
      }
    });

    return () => {
      currentNetwork.removeChangeListener(onNetworkChange);
      unsubscribe();
    };
  }, [offscreenCanvas]);

  return (
    <div className="fixed inset-0 overflow-hidden bg-black">
      <canvas ref={previewCanvasRef}></canvas>
    </div>
  );
}
