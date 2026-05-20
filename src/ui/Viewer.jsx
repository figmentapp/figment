import React, { useEffect, useRef, useState } from 'react';
import * as figment from '../figment';
import { computeAspectFit } from '../g';
import { useAppStore } from './store';
import { shouldRedrawViewer } from './viewer-state';
import ProjectionQuadEditor from './ProjectionQuadEditor';

const BLIT_WGSL = `
struct Uniforms {
  scale: vec2f,
};
@group(0) @binding(0) var<uniform> u: Uniforms;
@group(0) @binding(1) var defaultSampler: sampler;
@group(0) @binding(2) var u_texture: texture_2d<f32>;

@fragment
fn fs_main(in: VertexOutput) -> @location(0) vec4f {
  // Scale UVs around center to maintain aspect ratio
  let centered = (in.uv - 0.5) / u.scale + 0.5;
  // Use textureSampleLevel to avoid uniform-control-flow requirement
  let color = textureSampleLevel(u_texture, defaultSampler, centered, 0.0);
  if (centered.x < 0.0 || centered.x > 1.0 || centered.y < 0.0 || centered.y > 1.0) {
    return vec4f(0.0, 0.0, 0.0, 1.0);
  }
  // Premultiply alpha for canvas display
  return vec4f(color.rgb * color.a, color.a);
}
`;

export default function Viewer() {
  const network = useAppStore((s) => s.network);
  const fullscreen = useAppStore((s) => s.fullscreen);
  useAppStore((s) => s.version); // re-render overlays on port changes
  const canvasRef = useRef(null);
  const gpuContextRef = useRef(null);
  const blitPipelineRef = useRef(null);
  const shouldDrawRef = useRef(false);
  const [letterbox, setLetterbox] = useState(null);

  const draw = () => {
    const device = figment.getDevice();
    const canvas = canvasRef.current;
    const gpuContext = gpuContextRef.current;
    if (!device || !canvas || !gpuContext || !blitPipelineRef.current) return;

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

    const fit = computeAspectFit(canvas.width, canvas.height, outPort.value.width, outPort.value.height);
    const scale = [fit.width / canvas.width, fit.height / canvas.height];

    setLetterbox((prev) => {
      if (prev && prev.offsetX === fit.offsetX && prev.offsetY === fit.offsetY && prev.width === fit.width && prev.height === fit.height) {
        return prev;
      }
      return { offsetX: fit.offsetX, offsetY: fit.offsetY, width: fit.width, height: fit.height };
    });

    // Render to the canvas texture
    const canvasTexture = gpuContext.getCurrentTexture();
    const canvasView = canvasTexture.createView();

    const pipelineInfo = blitPipelineRef.current;
    const uniformData = figment.packUniforms(pipelineInfo.uniformLayout, { scale });
    const uniformBuffer = device.createBuffer({
      size: uniformData.byteLength || 16,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
    device.queue.writeBuffer(uniformBuffer, 0, uniformData);

    const bindGroup = device.createBindGroup({
      layout: pipelineInfo.bindGroupLayout,
      entries: [
        { binding: 0, resource: { buffer: uniformBuffer } },
        { binding: 1, resource: figment.samplers.linearClamp },
        { binding: 2, resource: outPort.value.view },
      ],
    });

    const encoder = device.createCommandEncoder({ label: 'viewer encoder' });
    const pass = encoder.beginRenderPass({
      colorAttachments: [
        {
          view: canvasView,
          loadOp: 'clear',
          storeOp: 'store',
          clearValue: { r: 0, g: 0, b: 0, a: 1 },
        },
      ],
    });
    pass.setPipeline(pipelineInfo.pipeline);
    pass.setBindGroup(0, bindGroup);
    pass.draw(3);
    pass.end();

    device.queue.submit([encoder.finish()]);
    uniformBuffer.destroy();
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

    const canvas = canvasRef.current;
    const gpuContext = canvas.getContext('webgpu');
    gpuContext.configure({
      device,
      format: navigator.gpu.getPreferredCanvasFormat(),
      alphaMode: 'premultiplied',
    });
    gpuContextRef.current = gpuContext;

    // Create blit pipeline targeting the canvas format
    const canvasFormat = navigator.gpu.getPreferredCanvasFormat();
    blitPipelineRef.current = figment.createRenderPipeline({
      wgsl: BLIT_WGSL,
      uniforms: { scale: 'vec2f' },
      textures: ['u_texture'],
      targetFormat: canvasFormat,
      label: 'viewer blit',
    });

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
