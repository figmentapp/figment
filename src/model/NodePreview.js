import * as twgl from 'twgl.js';

const NODE_WIDTH = 100;
const NODE_HEIGHT = 56;
const NODE_BORDER = 1.5;
const PREVIEW_GEO_WIDTH = NODE_WIDTH;
const PREVIEW_GEO_HEIGHT = NODE_HEIGHT;
const PREVIEW_GEO_RATIO = PREVIEW_GEO_WIDTH / PREVIEW_GEO_HEIGHT;

const VERTEX_SHADER = `
uniform vec2 u_viewport;
uniform vec2 u_position;
uniform vec3 u_camera;
attribute vec2 a_position;
attribute vec2 a_uv;
varying vec2 v_uv;
void main() {
  v_uv = a_uv;
  vec2 pos = a_position / u_viewport;
  pos.x += u_position.x / u_viewport.x;
  pos.y += u_position.y / u_viewport.y;
  pos.x *= u_camera.z;
  pos.y *= u_camera.z;
  pos.x += u_camera.x / u_viewport.x;
  pos.y += u_camera.y / u_viewport.y;
  pos.x = pos.x * 2.0 - 1.0;
  pos.y = (1.0 - pos.y) * 2.0 - 1.0;
  gl_Position = vec4(pos, 0.0, 1.0);
}
`;

const FRAGMENT_SHADER = `
precision mediump float;
uniform sampler2D u_texture;
uniform vec2 u_resolution;
uniform vec4 u_color;
varying vec2 v_uv;
void main() {
  float image_ratio = u_resolution.x / u_resolution.y;
  float box_width = ${PREVIEW_GEO_WIDTH}.0;
  float box_height = ${PREVIEW_GEO_HEIGHT}.0;
  float box_ratio = ${PREVIEW_GEO_RATIO};
  float delta_ratio = box_ratio / image_ratio;
  if (image_ratio > box_ratio) {
    float scale_factor = box_width / u_resolution.x;
    float height_diff = (box_height - u_resolution.y * scale_factor) / box_height;
    float half_height_diff = height_diff / 2.0;
    if (v_uv.y < half_height_diff || v_uv.y > 1.0 - half_height_diff) {
      gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0);
    } else {
      vec2 uv = vec2(v_uv.x, (v_uv.y - half_height_diff) / delta_ratio);
      gl_FragColor = u_color * texture2D(u_texture, uv);
    }
  } else {
    float scale_factor = box_height / u_resolution.y;
    float width_diff = (box_width - u_resolution.x * scale_factor) / box_width;
    float half_width_diff = width_diff / 2.0;
    if (v_uv.x < half_width_diff || v_uv.x > 1.0 - half_width_diff) {
      gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0);
    } else {
      vec2 uv = vec2((v_uv.x - half_width_diff) * delta_ratio, v_uv.y);
      gl_FragColor = u_color * texture2D(u_texture, uv);
    }
  }
}
`;

export default class NodePreview {
  constructor({ canvas, ensureRenderContext } = {}) {
    this.canvas = canvas ?? new OffscreenCanvas(1, 1);
    this.ensureRenderContext = ensureRenderContext ?? ((c) => this.canvas.getContext('webgl', { premultipliedAlpha: false }));
    this.width = 0;
    this.height = 0;
    this.x = 0;
    this.y = 0;
    this.scale = 1;

    this.framebufferInfo = null;
    this.programInfo = null;
    this.bufferInfo = null;
    this.defaultTexture = null;
  }

  setCanvas(canvas) {
    if (!canvas) return;
    this.canvas = canvas;
  }

  setViewport(viewport) {
    if (!viewport) {
      this.width = 0;
      this.height = 0;
      this.x = 0;
      this.y = 0;
      this.scale = 1;
      this._disposeFramebuffer();
      return;
    }

    const { width, height, x = 0, y = 0, scale = 1 } = viewport;
    const nextWidth = Math.max(0, Math.floor(width ?? 0));
    const nextHeight = Math.max(0, Math.floor(height ?? 0));
    const changedSize = this.width !== nextWidth || this.height !== nextHeight;

    this.width = nextWidth;
    this.height = nextHeight;
    this.x = typeof x === 'number' ? x : 0;
    this.y = typeof y === 'number' ? y : 0;
    this.scale = typeof scale === 'number' ? scale : 1;

    if (changedSize) {
      this._disposeFramebuffer();
    }

    if (this.width > 0 && this.height > 0) {
      this._ensureResources();
      this._ensureFramebuffer();
    }
  }

  async render(network, captureFramebufferBitmap) {
    if (!network || !this.width || !this.height || typeof captureFramebufferBitmap !== 'function') {
      return null;
    }

    this._ensureResources();
    const gl = this.ensureRenderContext(this.canvas);
    const framebufferInfo = this._ensureFramebuffer();
    if (!framebufferInfo) return null;

    twgl.bindFramebufferInfo(gl, framebufferInfo);
    gl.viewport(0, 0, this.width, this.height);
    gl.clearColor(0.05, 0.06, 0.09, 1.0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

    gl.useProgram(this.programInfo.program);
    twgl.setBuffersAndAttributes(gl, this.programInfo, this.bufferInfo);
    twgl.setUniforms(this.programInfo, {
      u_viewport: [this.width, this.height],
      u_camera: [this.x, this.y, this.scale],
    });

    for (const node of network.nodes || []) {
      const outPort = node?.outPorts?.[0];
      const value = outPort?.value;
      let texture = this.defaultTexture;
      let textureWidth = PREVIEW_GEO_WIDTH;
      let textureHeight = PREVIEW_GEO_HEIGHT;
      let color = [1, 0, 1, 1];

      if (value && value._fbo && value._fbo.attachments && value._fbo.attachments[0]) {
        texture = value._fbo.attachments[0];
        textureWidth = value.width || value._fbo.width || PREVIEW_GEO_WIDTH;
        textureHeight = value.height || value._fbo.height || PREVIEW_GEO_HEIGHT;
        color = [1, 1, 1, 1];
      }

      const destWidth = NODE_WIDTH * this.scale - NODE_BORDER * 2;
      const destHeight = NODE_HEIGHT * this.scale - NODE_BORDER * 2;
      if (destWidth <= 0 || destHeight <= 0) {
        continue;
      }

      twgl.setUniforms(this.programInfo, {
        u_position: [node.x, node.y],
        u_texture: texture,
        u_color: color,
        u_resolution: [textureWidth, textureHeight],
      });
      twgl.drawBufferInfo(gl, this.bufferInfo);
    }

    gl.disable(gl.BLEND);
    twgl.bindFramebufferInfo(gl, null);

    const overlay = await captureFramebufferBitmap({
      _fbo: framebufferInfo,
      width: this.width,
      height: this.height,
    });
    return overlay;
  }

  dispose() {
    this._disposeFramebuffer();
    if (this.defaultTexture) {
      const gl = this.ensureRenderContext(this.canvas);
      gl.deleteTexture(this.defaultTexture);
      this.defaultTexture = null;
    }
    this.programInfo = null;
    this.bufferInfo = null;
  }

  _ensureResources() {
    const gl = this.ensureRenderContext(this.canvas);
    if (!this.programInfo) {
      this.programInfo = twgl.createProgramInfo(gl, [VERTEX_SHADER, FRAGMENT_SHADER]);
    }
    if (!this.bufferInfo) {
      const w = PREVIEW_GEO_WIDTH;
      const h = PREVIEW_GEO_HEIGHT;
      const positionData = new Float32Array([0, 0, w, 0, 0, h, 0, h, w, 0, w, h]);
      const uvData = new Float32Array([0, 0, 1, 0, 0, 1, 0, 1, 1, 0, 1, 1]);
      this.bufferInfo = twgl.createBufferInfoFromArrays(gl, {
        a_position: { numComponents: 2, data: positionData },
        a_uv: { numComponents: 2, data: uvData },
      });
    }
    if (!this.defaultTexture) {
      this.defaultTexture = twgl.createTexture(gl, {
        src: new Uint8Array([255, 0, 255, 255]),
        width: 1,
        height: 1,
        min: gl.NEAREST,
        mag: gl.NEAREST,
      });
    }
  }

  _ensureFramebuffer() {
    if (!this.width || !this.height) {
      return null;
    }
    const gl = this.ensureRenderContext(this.canvas);
    const w = Math.max(1, Math.floor(this.width));
    const h = Math.max(1, Math.floor(this.height));

    if (!this.framebufferInfo || this.framebufferInfo.width !== w || this.framebufferInfo.height !== h) {
      this._disposeFramebuffer();
      const attachments = [
        {
          format: gl.RGBA,
          type: gl.UNSIGNED_BYTE,
          min: gl.LINEAR,
          mag: gl.LINEAR,
          wrap: gl.CLAMP_TO_EDGE,
        },
      ];
      this.framebufferInfo = twgl.createFramebufferInfo(gl, attachments, w, h);
    }

    return this.framebufferInfo;
  }

  _disposeFramebuffer() {
    if (!this.framebufferInfo) return;
    const gl = this.ensureRenderContext(this.canvas);
    const attachments = this.framebufferInfo.attachments || [];
    attachments.forEach((attachment) => {
      if (!attachment) return;
      if (attachment.texture) {
        gl.deleteTexture(attachment.texture);
      } else {
        gl.deleteTexture(attachment);
      }
    });
    gl.deleteFramebuffer(this.framebufferInfo.framebuffer);
    this.framebufferInfo = null;
  }
}
