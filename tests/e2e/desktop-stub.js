// Injected via addInitScript: minimal stand-in for the Electron preload bridge
// (src/electron/preload.mjs) so the UI can boot in a plain browser.
// Synchronous getters must return values directly; everything else resolves
// to undefined, which callers treat as "nothing happened".
(() => {
  // Presenting WebGPU frames to a canvas is broken in headless SwiftShader
  // (the device is lost on the first present), so replace the canvas 'webgpu'
  // context with one that hands out plain offscreen textures. The app renders
  // normally; the frames just never reach the screen.
  const origGetContext = HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext = function (type, ...args) {
    if (type !== 'webgpu') return origGetContext.call(this, type, ...args);
    const canvas = this;
    let device = null;
    let format = null;
    let texture = null;
    return {
      canvas,
      configure(config) {
        device = config.device;
        format = config.format;
      },
      unconfigure() {
        device = null;
      },
      getCurrentTexture() {
        const width = Math.max(1, canvas.width);
        const height = Math.max(1, canvas.height);
        if (!texture || texture.width !== width || texture.height !== height) {
          if (texture) texture.destroy();
          texture = device.createTexture({
            size: [width, height],
            format,
            usage:
              GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_SRC | GPUTextureUsage.COPY_DST,
          });
        }
        return texture;
      },
    };
  };

  let runtimeMode = 'edit';
  let currentFrame = 0;
  let exportFps = 60;

  const sync = {
    getPackagedFile: (filePath) => filePath.replace('examples/', ''),
    pathToFileURL: (filename) => `assets/${filename}`,
    getRuntimeMode: () => runtimeMode,
    setRuntimeMode: (mode) => {
      runtimeMode = mode;
    },
    getCurrentFrame: () => currentFrame,
    setCurrentFrame: (frame) => {
      currentFrame = frame;
    },
    getExportFps: () => exportFps,
    setExportFps: (fps) => {
      exportFps = fps;
    },
    registerListener: () => {},
    registerGlobalShortcut: () => {},
    unregisterGlobalShortcut: () => {},
    setDocumentEdited: () => {},
    setRepresentedFilename: () => {},
  };

  const asyncDefaults = {
    getMidiDevices: async () => [],
    globFiles: async () => [],
  };

  // The preload also exposes Node's path module as window.nodePath.
  const normalize = (p) => {
    const abs = p.startsWith('/');
    const parts = [];
    for (const part of p.split('/')) {
      if (!part || part === '.') continue;
      if (part === '..' && parts.length && parts[parts.length - 1] !== '..') parts.pop();
      else parts.push(part);
    }
    return (abs ? '/' : '') + parts.join('/');
  };
  window.nodePath = {
    isAbsolute: (p) => p.startsWith('/'),
    dirname: (p) => normalize(p).split('/').slice(0, -1).join('/') || (p.startsWith('/') ? '/' : '.'),
    join: (...parts) => normalize(parts.join('/')),
    resolve: (...parts) => {
      let resolved = '';
      for (const part of parts) {
        resolved = part.startsWith('/') ? part : `${resolved}/${part}`;
      }
      return normalize(resolved || '/');
    },
    relative: (from, to) => normalize(to).replace(normalize(from) + '/', ''),
    basename: (p) => normalize(p).split('/').pop(),
    extname: (p) => {
      const base = normalize(p).split('/').pop();
      const i = base.lastIndexOf('.');
      return i > 0 ? base.slice(i) : '';
    },
  };

  window.desktop = new Proxy(
    { ...sync, ...asyncDefaults },
    {
      get(target, prop) {
        if (prop in target) return target[prop];
        return async () => undefined;
      },
    },
  );
})();
