import React, { useRef, useEffect } from 'react';
import * as twgl from 'twgl.js';

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
  pos.x = pos.x * 2.0 - 1.0;
  pos.y = (1.0 - pos.y) * 2.0 - 1.0;
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

const Viewer = ({ offscreenCanvas, network }) => {
  const previewCanvasRef = useRef(null);

  useEffect(() => {
    const gl = offscreenCanvas.getContext('webgl');
    const programInfo = twgl.createProgramInfo(gl, [VERTEX_SHADER, FRAGMENT_SHADER]);

    // Create a default checkerboard texture.
    const checkerTexture = {
      mag: gl.NEAREST,
      min: gl.LINEAR,
      src: [255, 255, 255, 255, 192, 192, 192, 255, 192, 192, 192, 255, 255, 255, 255, 255],
    };
    const defaultTexture = twgl.createTexture(gl, checkerTexture);

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
    const nodeRectBufferInfo = twgl.createBufferInfoFromArrays(gl, arrays);

    const draw = () => {
      const canvas = offscreenCanvas;
      const previewCanvas = previewCanvasRef.current;
      if (!previewCanvas) return;
      const parent = previewCanvas.parentElement;
      if (canvas.width !== parent.clientWidth || canvas.height !== parent.clientHeight) {
        canvas.width = parent.clientWidth;
        canvas.height = parent.clientHeight;
        previewCanvas.width = parent.clientWidth;
        previewCanvas.height = parent.clientHeight;
      }
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.clearColor(0.05, 0.06, 0.09, 1.0);
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
        texture = defaultTexture;
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
        const scaleFactor = canvasRatio / textureRatio;
        u_scale = [scaleFactor, 1.0];
      }

      twgl.bindFramebufferInfo(gl, null);
      gl.useProgram(programInfo.program);
      twgl.setBuffersAndAttributes(gl, programInfo, nodeRectBufferInfo);
      twgl.setUniforms(programInfo, {
        u_texture: texture,
        u_color: nodeColor,
        u_viewport: [canvas.width, canvas.height],
        u_resolution: [textureWidth, textureHeight],
        u_scale: u_scale,
      });
      twgl.drawBufferInfo(gl, nodeRectBufferInfo);

      // Draw the offscreen canvas on the preview canvas.
      const previewContext = previewCanvas.getContext('bitmaprenderer');
      const bitmap = canvas.transferToImageBitmap();
      previewContext.transferFromImageBitmap(bitmap);
    };

    const animate = () => {
      draw();
      window.requestAnimationFrame(animate);
    };

    animate();

    return () => {
      // Cleanup logic here
    };
  }, [offscreenCanvas, network]);

  return (
    <div className="fixed inset-0 overflow-hidden">
      <canvas ref={previewCanvasRef}></canvas>
    </div>
  );
};

export default Viewer;
