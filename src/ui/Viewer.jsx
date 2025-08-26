import React, { Component } from 'react';
import * as figment from '../figment';

export default class Viewer extends Component {
  constructor(props) {
    super(props);
    this.previewCanvasRef = React.createRef();
    this._onNetworkChange = this._onNetworkChange.bind(this);
    this._animate = this._animate.bind(this);
  }

  componentDidMount() {
    // WebGPU canvas setup
    const canvas = this.previewCanvasRef.current;
    this._resizeCanvas();
    this.ctx = figment.initWebGPUCanvas(canvas);
    // Simple present pipeline with letterboxing
    const fragmentShaderSource = `
@fragment
fn fs_main(in: VertexOutput) -> @location(0) vec4f {
  let texRatio = u.texSize.x / u.texSize.y;
  let canvasRatio = u.canvasSize.x / u.canvasSize.y;
  // Canvas UV from fragment position (pixels)
  let uvCanvas = in.position.xy / u.canvasSize;
  var uvRemap: vec2f;
  if (texRatio > canvasRatio) {
    // Fit width; scale height
    let scale = canvasRatio / texRatio;
    uvRemap = vec2f(uvCanvas.x, (uvCanvas.y - (1.0 - scale) * 0.5) / scale);
  } else {
    // Fit height; scale width
    let scale = texRatio / canvasRatio;
    uvRemap = vec2f((uvCanvas.x - (1.0 - scale) * 0.5) / scale, uvCanvas.y);
  }
  // Mask outside [0,1] without branching
  let in0 = step(0.0, uvRemap.x) * step(0.0, uvRemap.y);
  let in1 = step(uvRemap.x, 1.0) * step(uvRemap.y, 1.0);
  let mask = in0 * in1;
  // Sample always, clamp coords to avoid sampling outside
  let color = textureSample(u_input_texture, defaultSampler, clamp(uvRemap, vec2f(0.0), vec2f(1.0)));
  return mix(vec4f(0.0, 0.0, 0.0, 1.0), color, mask);
}
`;
    const fragmentShader = figment.makeFragmentShader(fragmentShaderSource, {
      uniformsSpec: { texSize: 'vec2f', canvasSize: 'vec2f' },
      textures: ['u_input_texture'],
    });
    this.pipeline = figment.createRenderPipeline({ fragmentShader, label: 'viewer.present' });
    this.sampler = window._gpu.device.createSampler({ minFilter: 'linear', magFilter: 'linear' });

    // Listen for network changes.
    this.props.network.addChangeListener(this._onNetworkChange);
    this._animate();
  }

  componentDidUpdate(prevProps) {
    if (prevProps.network !== this.props.network) {
      prevProps.network.removeChangeListener(this._onNetworkChange);
      this.props.network.addChangeListener(this._onNetworkChange);
    }
    this._draw();
  }

  render() {
    return (
      <div className="fixed inset-0 overflow-hidden bg-black">
        <canvas ref={this.previewCanvasRef}></canvas>
      </div>
    );
  }

  _draw() {
    const { network } = this.props;
    const canvas = this.previewCanvasRef.current;
    if (!canvas) return;
    this._resizeCanvas();

    // Always display the first Out node's output; draw black if none
    let outPort = null;
    const outNode = network.nodes.find((n) => n.type === 'core.out');
    if (outNode && outNode.outPorts && outNode.outPorts.length > 0) {
      outPort = outNode.outPorts[0];
    }

    const device = window._gpu.device;
    if (!device) return;

    const currentView = this.ctx.getCurrentTexture().createView();
    const encoder = device.createCommandEncoder();
    const pass = encoder.beginRenderPass({
      colorAttachments: [
        {
          view: currentView,
          loadOp: 'clear',
          storeOp: 'store',
          clearValue: { r: 0, g: 0, b: 0, a: 1 },
        },
      ],
    });

    pass.setPipeline(this.pipeline);

    // Uniforms: tex/canvas size
    let texW = 0, texH = 0;
    let view = null;
    if (outPort && outPort.value && outPort.value.view) {
      texW = outPort.value.width || 1;
      texH = outPort.value.height || 1;
      view = outPort.value.view;
    }

    if (view) {
      // Create transient uniform buffer
      const ubuf = device.createBuffer({ size: 32, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
      const udata = new Float32Array([texW, texH, canvas.width, canvas.height]);
      device.queue.writeBuffer(ubuf, 0, udata.buffer, udata.byteOffset, udata.byteLength);

      const entries = [
        { binding: 0, resource: { buffer: ubuf } },
        { binding: 1, resource: this.sampler },
        { binding: 2, resource: view },
      ];

      const bindGroup = device.createBindGroup({ layout: this.pipeline.getBindGroupLayout(0), entries });
      pass.setBindGroup(0, bindGroup);
      pass.draw(3, 1, 0, 0);
    }
    pass.end();
    device.queue.submit([encoder.finish()]);
  }

  _onNetworkChange() {
    this._shouldDraw = true;
  }

  _animate() {
    if (this._shouldDraw) {
      this._draw();
      this._shouldDraw = false;
    }
    window.requestAnimationFrame(this._animate);
  }

  _resizeCanvas() {
    const c = this.previewCanvasRef.current;
    if (!c) return;
    const parent = c.parentElement;
    if (!parent) return;
    if (c.width !== parent.clientWidth || c.height !== parent.clientHeight) {
      c.width = parent.clientWidth;
      c.height = parent.clientHeight;
    }
  }
}
