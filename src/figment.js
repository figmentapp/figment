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

const _loadedScripts = new Set();
export async function loadScripts(scripts) {
  const loadScript = (script) => {
    return new Promise((resolve, reject) => {
      const scriptElement = document.createElement('script');
      scriptElement.src = script;
      scriptElement.onload = resolve;
      scriptElement.onerror = reject;
      document.head.appendChild(scriptElement);
    });
  };

  for (const script of scripts) {
    if (_loadedScripts.has(script)) continue;
    await loadScript(script);
    _loadedScripts.add(script);
  }
}

const DEFAULT_VERTEX_SHADER = `
attribute vec3 a_position;
attribute vec2 a_uv;
varying vec2 v_uv;
void main() {
  v_uv = a_uv;
  gl_Position = vec4(a_position, 1.0);
}`;

const DEFAULT_FRAGMENT_SHADER = `
precision mediump float;
uniform sampler2D u_image;
varying vec2 v_uv;
void main() {
  gl_FragColor = texture2D(u_image, v_uv);
}
`;

const _shaderProgramCache = {};

export function createShaderProgram(shader1 = null, shader2 = null) {
  let vertexShader, fragmentShader;
  if (shader1 === null && shader2 === null) {
    vertexShader = DEFAULT_VERTEX_SHADER;
    fragmentShader = DEFAULT_FRAGMENT_SHADER;
  } else if (shader2 === null) {
    vertexShader = DEFAULT_VERTEX_SHADER;
    fragmentShader = shader1;
  } else {
    vertexShader = shader1;
    fragmentShader = shader2;
  }
  const cachedShaderProgram = _shaderProgramCache[vertexShader + fragmentShader];
  if (cachedShaderProgram) return cachedShaderProgram;
  const shaderProgram = twgl.createProgramInfo(window.gl, [vertexShader, fragmentShader]);
  _shaderProgramCache[vertexShader + fragmentShader] = shaderProgram;
  return shaderProgram;
}

export function createTextureFromUrl(url, callback) {
  return twgl.createTexture(window.gl, { src: url }, callback);
}

export function createErrorTexture() {
  const checkerTexture = {
    mag: window.gl.NEAREST,
    min: window.gl.LINEAR,
    src: [255, 255, 255, 255, 192, 192, 192, 255, 192, 192, 192, 255, 255, 255, 255, 255],
  };
  return twgl.createTexture(window.gl, checkerTexture);
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

export function clear() {
  const gl = window.gl;
  gl.clearColor(0, 0, 0, 0);
  gl.clear(gl.COLOR_BUFFER_BIT);
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

export function toCanvasColor(color) {
  return `rgba(${color[0]}, ${color[1]}, ${color[2]}, ${color[3]})`;
}

const _canvas = new OffscreenCanvas(1, 1);
let _imageData;
export function framebufferToImageData(framebuffer) {
  const width = framebuffer.width;
  const height = framebuffer.height;

  if (framebuffer.width !== _canvas.width || framebuffer.height !== _canvas.height) {
    _canvas.width = framebuffer.width;
    _canvas.height = height;
    _imageData = new ImageData(width, height);
    framebuffer.setSize(width, height);
  }
  framebuffer.bind();
  window.gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, _imageData.data);
  framebuffer.unbind();
  return _imageData;
}

export function canvasToFramebuffer(canvas, framebuffer) {
  window.gl.bindTexture(gl.TEXTURE_2D, framebuffer.texture);
  window.gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, canvas);
  window.gl.bindTexture(gl.TEXTURE_2D, null);
}

const _modelCache = {};
export async function loadModel(modelName, modelGlobal, options) {
  if (_modelCache[modelName]) return _modelCache[modelName];

  await figment.loadScripts([`https://cdn.jsdelivr.net/npm/@tensorflow-models/${modelName}`]);
  // await tf.ready();
  // const tfContext = new tf.webgl.GPGPUContext(window.gl);
  // tf.ENV.registerBackend('custom-webgl', () => {
  //   return new tf.webgl.MathBackendWebGL(tfContext);
  // });
  // tf.setBackend('custom-webgl');

  const model = await window[modelGlobal].load(options);
  _modelCache[modelName] = model;
  return model;
}
