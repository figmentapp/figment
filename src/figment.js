// Functions that are available in the "figment" namespace. Related to project files.
// Look in preload.js for functions that are exposed in this module (e.g. nodePath).
import * as twgl from 'twgl.js';

export function projectFile() {
  if (!window.app) return '';
  if (!window.app.state.filePath) return '';
  return window.app.state.filePath;
}

export function projectDirectory() {
  if (!window.app) return '';
  if (!window.app.state.filePath) return '';
  return nodePath.dirname(window.app.state.filePath);
}

export function filePathForAsset(filename) {
  if (nodePath.isAbsolute(filename)) return filename;
  const filePath = nodePath.join(projectDirectory(), filename);
  return filePath;
}

export function urlForAsset(filename) {
  const filePath = filePathForAsset(filename);
  const absoluteFilePath = nodePath.resolve(filePath);
  const assetUrl = window.desktop.pathToFileURL(absoluteFilePath);
  return assetUrl;
}

export function debounce(fn, delay) {
  let timer = null;
  return function () {
    const context = this;
    const args = arguments;
    clearTimeout(timer);
    timer = setTimeout(() => fn.apply(context, args), delay);
  };
}

export function filePathToRelative(filename) {
  return nodePath.relative(projectDirectory(), filename);
}

const DEFAULT_VERTEX_SHADER = `
attribute vec3 a_position;
attribute vec2 a_uv;
varying vec2 v_uv;
void main() {
  v_uv = a_uv;
  gl_Position = vec4(a_position, 1.0);
}`;

const _shaderProgramCache = {};

export function createShaderProgram(fragmentShader) {
  const cachedShaderProgram = _shaderProgramCache[fragmentShader];
  if (cachedShaderProgram) return cachedShaderProgram;
  const shaderProgram = twgl.createProgramInfo(window.gl, [DEFAULT_VERTEX_SHADER, fragmentShader]);
  // let material = new THREE.RawShaderMaterial({
  //   vertexShader: DEFAULT_VERTEX_SHADER,
  //   fragmentShader,
  //   uniforms,
  // });
  _shaderProgramCache[fragmentShader] = shaderProgram;
  return shaderProgram;
}

export function createTextureFromUrl(url, callback) {
  return twgl.createTexture(window.gl, { src: url }, callback);
}

export class Framebuffer {
  constructor(width = 0, height = 0) {
    if (width > 0 && height > 0) {
      this._create(width, height);
    }
  }

  setSize(width, height) {
    if (width === this.width && height === this.height) return;
    const gl = window.gl;
    if (this._fbo) {
      gl.deleteTexture(this._fbo.attachments[0].texture);
      gl.deleteFramebuffer(this._fbo.framebuffer);
    }
    this._create(width, height);
  }

  _create(width, height) {
    this.width = width;
    this.height = height;
    this._fbo = twgl.createFramebufferInfo(window.gl, [{ format: window.gl.RGBA }], width, height);
  }

  bind() {
    twgl.bindFramebufferInfo(window.gl, this._fbo);
  }

  unbind() {
    twgl.bindFramebufferInfo(window.gl, null);
  }

  get texture() {
    return this._fbo.attachments[0];
  }
}

let _quadBufferInfo = null;

export function drawQuad(shaderProgram, uniforms) {
  const gl = window.gl;
  if (!_quadBufferInfo) {
    const arrays = {
      a_position: { numComponents: 2, data: [-1, -1, -1, 1, 1, 1, 1, -1] },
      a_uv: { numComponents: 2, data: [0, 0, 0, 1, 1, 1, 1, 0] },
      indices: [0, 1, 2, 0, 2, 3],
    };
    _quadBufferInfo = twgl.createBufferInfoFromArrays(gl, arrays);
  }
  gl.useProgram(shaderProgram.program);
  twgl.setBuffersAndAttributes(gl, shaderProgram, _quadBufferInfo);
  twgl.setUniforms(shaderProgram, uniforms);
  twgl.drawBufferInfo(gl, _quadBufferInfo);
}
