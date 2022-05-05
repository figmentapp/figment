import Network, { getDefaultNetwork } from './model/Network';
import Library from './model/Library';
import { setupIoFunctions } from './browser/io';
import * as figment from './figment';

window.figment = figment;
setupIoFunctions();

class Player {
  constructor(canvas) {
    if (typeof canvas === 'string') {
      canvas = document.getElementById(canvas);
    }
    if (!canvas) {
      throw new Error('No canvas found');
    }
    this.canvas = canvas;
    this.gl = canvas.getContext('webgl');
    window.gl = this.gl;
    this.defaultShader = figment.createShaderProgram();
  }

  async loadDefault() {
    const library = new Library();
    this.network = new Network(library);
    this.network.parse(getDefaultNetwork());
    await this.network.start();
    console.log('Network started.');
  }

  async load(filename) {
    const library = new Library();
    this.network = new Network(library);
    const res = await fetch(filename);
    const json = await res.json();
    this.network.parse(json);
    console.log('Network loaded.');
  }

  async start() {
    await this.network.start();
    console.log('Network started.');
  }

  async render() {
    await this.network.render();
    const gl = this.gl;
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    gl.clearColor(0.0, 0.0, 0.0, 1.0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    // figment.drawQuad(this.defaultShader);
    const outNode = this.network.nodes.find((n) => n.type === 'core.out');
    if (!outNode) {
      throw new Error(`No output node found`);
    }
    const outPort = outNode.outPorts[0];
    let texture, textureWidth, textureHeight;
    if (outPort.value && outPort.value._fbo) {
      //   nodeColor = [1, 1, 1, 1];
      texture = outPort.value._fbo.attachments[0];
      textureWidth = outPort.value.width;
      textureHeight = outPort.value.height;
    }
    // console.log(textureWidth, textureHeight);
    const uniforms = {
      u_image: texture,
    };
    figment.drawQuad(this.defaultShader, uniforms);
    // requestAnimationFrame(this.run.bind(this));
  }
}

export { Player };
