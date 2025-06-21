/**
 * @name Receive Rokoko
 * @description Receive realtime motion capture data from Rokoko Studio.
 * @category comms
 */

const portIn = node.numberIn('port', 14043);

// Add inputs and outputs for skeleton image drawing
const backgroundIn = node.colorIn('background', [0, 0, 0, 1]);
const pointsToggleIn = node.toggleIn('draw points', true);
const pointsColorIn = node.colorIn('points color', [255, 255, 255, 1]);
const pointsRadiusIn = node.numberIn('points radius', 2, { min: 0, max: 20, step: 0.1 });
const linesToggleIn = node.toggleIn('draw lines', true);
const linesColorIn = node.colorIn('lines color', [255, 255, 255, 1]);
const linesWidthIn = node.numberIn('lines width', 2, { min: 0, max: 20, step: 0.1 });

const imageOut = node.imageOut('out');
const detectedOut = node.booleanOut('detected');
const landmarksOut = node.objectOut('landmarks');
const bodyOut = node.objectOut('body');

pointsColorIn.label = 'Color';
pointsRadiusIn.label = 'Radius';
linesColorIn.label = 'Color';
linesWidthIn.label = 'Line Width';

// --- drawing helpers ---
let _framebuffer, _canvas, _ctx;
let _currentBody = null;
const DEFAULT_SIZE = 512;

const ROKOKO_BODY_CONNECTIONS = [
  ['hip', 'spine'],
  ['spine', 'chest'],
  ['chest', 'neck'],
  ['neck', 'head'],
  ['chest', 'leftShoulder'],
  ['leftShoulder', 'leftUpperArm'],
  ['leftUpperArm', 'leftLowerArm'],
  ['leftLowerArm', 'leftHand'],
  ['chest', 'rightShoulder'],
  ['rightShoulder', 'rightUpperArm'],
  ['rightUpperArm', 'rightLowerArm'],
  ['rightLowerArm', 'rightHand'],
  ['hip', 'leftUpLeg'],
  ['leftUpLeg', 'leftLeg'],
  ['leftLeg', 'leftFoot'],
  ['leftFoot', 'leftToe'],
  ['hip', 'rightUpLeg'],
  ['rightUpLeg', 'rightLeg'],
  ['rightLeg', 'rightFoot'],
  ['rightFoot', 'rightToe'],
];

let _listener;

node.onStart = async () => {
  // initialise drawing resources
  _framebuffer = new figment.Framebuffer();
  _framebuffer.setSize(DEFAULT_SIZE, DEFAULT_SIZE);
  _canvas = new OffscreenCanvas(DEFAULT_SIZE, DEFAULT_SIZE);
  _ctx = _canvas.getContext('2d');
  await figment.loadScripts(['./mediapipe/drawing_utils.js']);

  drawResults(); // initial blank frame

  // original listener setup
  _listener = (name, args) => {
    if (name !== 'message') return;
    if (args.port !== portIn.value) return;
    const data = new Uint8Array(args.data);
    const decoded = lz4Decompress(data);
    if (!decoded) return;
    const text = new TextDecoder().decode(decoded);
    try {
      const json = JSON.parse(text);
      const body = json?.scene?.actors?.[0]?.body;
      if (!body) return;
      _currentBody = body;
      bodyOut.set(body);
      landmarksOut.set(body?.joints ? { type: 'rokoko', body } : null);
      drawResults();
    } catch (e) {
      console.error('Failed to parse Rokoko data:', e);
    }
  };
  window.desktop.registerListener('udp', _listener);
  window.desktop.startUdpServer(portIn.value);
};

node.onStop = () => {
  window.desktop.registerListener('udp', null);
  window.desktop.stopUdpServer(portIn.value);
};

portIn.onChange = (oldPort, newPort) => {
  window.desktop.stopUdpServer(oldPort);
  window.desktop.startUdpServer(newPort);
};

function lz4Decompress(src, maxSize = 64 << 20) {
  src = new Uint8Array(src);

  // Detect LZ4 *frame* format (magic number : 0x184D2204 -> bytes 04 22 4D 18)
  if (src.length >= 4 && src[0] === 0x04 && src[1] === 0x22 && src[2] === 0x4d && src[3] === 0x18) {
    return lz4FrameDecompress(src, maxSize);
  }

  // Otherwise treat as a single raw LZ4 block
  return lz4BlockDecompress(src, maxSize);
}

function lz4BlockDecompress(src, maxSize) {
  src = new Uint8Array(src);
  const dst = [];
  let ip = 0;

  const spush = (b) => dst.push(b);

  function copyMatch(offset, len) {
    const base = dst.length - offset;
    if (base < 0) throw new Error('LZ4: offset beyond output size');
    for (let i = 0; i < len; ++i) spush(dst[base + i]);
  }

  while (ip < src.length) {
    const token = src[ip++];
    if (token === undefined) break;

    let litLen = token >>> 4;
    if (litLen === 15) {
      let s;
      while ((s = src[ip++]) === 0xff) litLen += 0xff;
      litLen += s;
    }
    for (let i = 0; i < litLen; ++i) spush(src[ip++]);
    if (ip >= src.length) break;

    const offset = src[ip] | (src[ip + 1] << 8);
    ip += 2;

    let matchLen = (token & 0x0f) + 4;
    if ((token & 0x0f) === 15) {
      let s;
      while ((s = src[ip++]) === 0xff) matchLen += 0xff;
      matchLen += s;
    }

    copyMatch(offset, matchLen);

    if (dst.length > maxSize) throw new Error('LZ4: exceeded maximum size');
  }

  return new Uint8Array(dst);
}

// Minimal LZ4 frame decoder – parses the header, then feeds each block to the raw decoder above
function lz4FrameDecompress(src, maxSize) {
  const dst = [];
  let ip = 0;

  // Skip magic number (already verified)
  ip += 4;

  const FLG = src[ip++];
  const BD = src[ip++];

  const hasBlockChecksum = (FLG & 0x10) !== 0;
  const hasContentSize = (FLG & 0x08) !== 0;
  const hasContentChecksum = (FLG & 0x04) !== 0;
  const hasDictID = (FLG & 0x01) !== 0;

  if (hasContentSize) ip += 8; // skip content size (UInt64)
  if (hasDictID) ip += 4; // skip dictionary id

  ip += 1; // header checksum (HC)

  // iterate over blocks
  while (ip + 4 <= src.length) {
    // read little-endian 32-bit block size
    const blockSize = src[ip] | (src[ip + 1] << 8) | (src[ip + 2] << 16) | (src[ip + 3] << 24);
    ip += 4;

    if (blockSize === 0) break; // EndMark

    const isCompressed = (blockSize & 0x80000000) === 0; // highest bit 0 means compressed
    const actualSize = blockSize & 0x7fffffff;

    if (ip + actualSize > src.length) throw new Error('LZ4: truncated block');

    const blockData = src.subarray(ip, ip + actualSize);
    ip += actualSize;

    let out;
    if (isCompressed) {
      out = lz4BlockDecompress(blockData, maxSize - dst.length);
    } else {
      // uncompressed block – copy directly
      out = blockData;
    }

    // append to dst
    for (let i = 0; i < out.length; ++i) dst.push(out[i]);

    if (hasBlockChecksum) ip += 4; // skip checksum

    if (dst.length > maxSize) throw new Error('LZ4: exceeded maximum size');
  }

  if (hasContentChecksum) ip += 4; // skip content checksum (ignored)

  return new Uint8Array(dst);
}

function drawResults() {
  const width = DEFAULT_SIZE;
  const height = DEFAULT_SIZE;

  // clear background
  _ctx.clearRect(0, 0, width, height);
  _ctx.fillStyle = figment.toCanvasColor(backgroundIn.value);
  _ctx.fillRect(0, 0, width, height);

  if (_currentBody) {
    const { landmarks, connections } = _extractLandmarksAndConnections(_currentBody, width, height);
    if (landmarks.length) {
      detectedOut.set(true);
      if (linesToggleIn.value && connections.length) {
        drawConnectors(_ctx, landmarks, connections, {
          color: figment.toCanvasColor(linesColorIn.value),
          lineWidth: linesWidthIn.value,
          visibilityMin: 0,
        });
      }
      if (pointsToggleIn.value) {
        drawLandmarks(_ctx, landmarks, {
          color: figment.toCanvasColor(pointsColorIn.value),
          lineWidth: pointsRadiusIn.value,
        });
      }
    } else {
      detectedOut.set(false);
    }
  } else {
    detectedOut.set(false);
  }

  // upload canvas to texture
  window.gl.bindTexture(gl.TEXTURE_2D, _framebuffer.texture);
  window.gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, _canvas);
  window.gl.bindTexture(gl.TEXTURE_2D, null);
  imageOut.set(_framebuffer);
}

function _extractLandmarksAndConnections(body, width, height) {
  const joints = body || {};
  const names = Object.keys(joints);
  if (!names.length) return { landmarks: [], connections: [] };

  // gather raw positions
  const raw = [];
  names.forEach((name) => {
    const j = joints[name];
    // support various position field names
    const pos = j.position || {};
    raw.push({ x: pos.x ?? 0, y: pos.y ?? 0, z: pos.z ?? 0 });
  });

  // normalise to canvas space
  const xs = raw.map((p) => p.x);
  const ys = raw.map((p) => p.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const rangeX = maxX - minX || 1;
  const rangeY = maxY - minY || 1;
  const scale = 0.8 * Math.min(width / rangeX, height / rangeY);
  const offsetX = (width - rangeX * scale) / 2;
  const offsetY = (height - rangeY * scale) / 2;

  const landmarks = raw.map((p) => ({
    x: (offsetX + (p.x - minX) * scale) / width,
    y: 1 - (offsetY + (p.y - minY) * scale) / height, // flip to match canvas coords
    visibility: 1,
  }));

  const nameToIdx = Object.fromEntries(names.map((name, i) => [name, i]));

  const connections = ROKOKO_BODY_CONNECTIONS.map(([p, c]) => [nameToIdx[p], nameToIdx[c]]).filter(
    (pair) => pair[0] !== undefined && pair[1] !== undefined,
  );

  return { landmarks, connections };
}
