// Functions that are available in the "figment" namespace. Related to project files.
// Look in preload.js for functions that are exposed in this module (e.g. nodePath).
import { gl } from 'chroma-js';
import * as twgl from 'twgl.js';

export function projectFile() {
  if (!window.app) return '';
  if (!window.app.state.filePath) return '';
  return window.app.state.filePath;
}

export function projectDirectory() {
  if (!window.app) return '';
  if (!window.app.state.filePath) return '';
  return path.dirname(window.app.state.filePath);
}

export function filePathForAsset(filename) {
  if (nodePath.isAbsolute(filename)) return filename;
  const filePath = nodePath.join(projectDirectory(), filename);
  return filePath;
}

export function urlForAsset(filename) {
  const filePath = filePathForAsset(filename);
  const absoluteFilePath = nodePath.resolve(filePath);
  const assetUrl = pathToFileURL(absoluteFilePath);
  return assetUrl;
}

export function filePathToRelative(filename) {
  return nodePath.relative(projectDirectory(), filename);
}

const DEFAULT_VERTEX_SHADER = `
attribute vec3 position;
attribute vec2 uv;
varying vec2 vUv;
void main() {
  gl_Position = vec4(position, 1.0);
  vUv = uv;
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

export class Framebuffer {
  constructor(width, height) {
    this._create(width, height);
  }

  setSize(width, height) {
    if (width === this.width && height === this.height) return;
    const gl = window.gl;
    gl.deleteTexture(this._fbo.attachments[0].texture);
    gl.deleteFramebuffer(this._fbo.framebuffer);
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
}

let _quadBufferInfo = null;

export function drawQuad(shaderProgram, uniforms) {
  const gl = window.gl;
  if (!_quadBufferInfo) {
    const arrays = {
      position: [-1, -1, 0, 1, -1, 0, -1, 1, 0, -1, 1, 0, 1, -1, 0, 1, 1, 0],
    };
    _quadBufferInfo = twgl.createBufferInfoFromArrays(gl, arrays);
  }
  gl.useProgram(shaderProgram.program);
  twgl.setBuffersAndAttributes(gl, shaderProgram, _quadBufferInfo);
  twgl.setUniforms(shaderProgram, uniforms);
  twgl.drawBufferInfo(gl, _quadBufferInfo);
}
