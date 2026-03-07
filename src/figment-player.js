import Network, { getDefaultNetwork } from './model/Network';
import Library from './model/Library';
import { setupIoFunctions } from './browser/io';
import * as figment from './figment';

window.figment = figment;
setupIoFunctions();

const BLIT_WGSL = `
@group(0) @binding(0) var blitSampler: sampler;
@group(0) @binding(1) var blitTexture: texture_2d<f32>;

struct VSOut {
  @builtin(position) pos: vec4f,
  @location(0) uv: vec2f,
};

@vertex fn vs(@builtin(vertex_index) i: u32) -> VSOut {
  var pos = array<vec2f, 3>(vec2f(-1,-1), vec2f(3,-1), vec2f(-1,3));
  var uv  = array<vec2f, 3>(vec2f(0,1),   vec2f(2,1),  vec2f(0,-1));
  var o: VSOut;
  o.pos = vec4f(pos[i], 0, 1);
  o.uv  = uv[i];
  return o;
}

@fragment fn fs(in: VSOut) -> @location(0) vec4f {
  return textureSample(blitTexture, blitSampler, in.uv);
}
`;

class Player {
  constructor(canvas) {
    if (typeof canvas === 'string') {
      canvas = document.getElementById(canvas);
    }
    if (!canvas) {
      throw new Error('No canvas found');
    }
    this.canvas = canvas;
    this._gpuContext = null;
    this._blitPipeline = null;
    this._blitSampler = null;
    this._blitBindGroupLayout = null;
  }

  async init() {
    await figment.initGPU();
    const device = figment.getDevice();
    this._gpuContext = this.canvas.getContext('webgpu');
    const format = navigator.gpu.getPreferredCanvasFormat();
    this._gpuContext.configure({ device, format, alphaMode: 'premultiplied' });

    const module = device.createShaderModule({ code: BLIT_WGSL });
    this._blitSampler = device.createSampler({ minFilter: 'linear', magFilter: 'linear' });
    this._blitBindGroupLayout = device.createBindGroupLayout({
      entries: [
        { binding: 0, visibility: GPUShaderStage.FRAGMENT, sampler: {} },
        { binding: 1, visibility: GPUShaderStage.FRAGMENT, texture: {} },
      ],
    });
    this._blitPipeline = device.createRenderPipeline({
      layout: device.createPipelineLayout({ bindGroupLayouts: [this._blitBindGroupLayout] }),
      vertex: { module, entryPoint: 'vs' },
      fragment: { module, entryPoint: 'fs', targets: [{ format }] },
    });
  }

  async loadDefault() {
    await this.init();
    const library = new Library();
    this.network = new Network(library);
    this.network.parse(getDefaultNetwork());
    await this.network.start();
  }

  async load(filename) {
    await this.init();
    const library = new Library();
    this.network = new Network(library);
    const res = await fetch(filename);
    const json = await res.json();
    this.network.parse(json);
  }

  async start() {
    await this.network.start();
  }

  async render() {
    await this.network.render();
    const device = figment.getDevice();

    const outNode = this.network.nodes.find((n) => n.type === 'core.out');
    if (!outNode) throw new Error('No output node found');
    const outPort = outNode.outPorts[0];
    if (!outPort.value || !outPort.value.texture) return;

    const bindGroup = device.createBindGroup({
      layout: this._blitBindGroupLayout,
      entries: [
        { binding: 0, resource: this._blitSampler },
        { binding: 1, resource: outPort.value.view },
      ],
    });

    const encoder = device.createCommandEncoder();
    const pass = encoder.beginRenderPass({
      colorAttachments: [
        {
          view: this._gpuContext.getCurrentTexture().createView(),
          loadOp: 'clear',
          clearValue: [0, 0, 0, 1],
          storeOp: 'store',
        },
      ],
    });
    pass.setPipeline(this._blitPipeline);
    pass.setBindGroup(0, bindGroup);
    pass.draw(3);
    pass.end();
    device.queue.submit([encoder.finish()]);
  }
}

export { Player };
