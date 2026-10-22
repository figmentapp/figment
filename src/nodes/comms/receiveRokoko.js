/**
 * @name Receive Rokoko
 * @description Receive realtime motion capture data from Rokoko Studio.
 * @category comms
 */

// The `pose` skeleton maps the Rokoko joints onto BlazePose's 33 landmarks
// (src/rokoko-pose.js) and draws them with Detect Pose's drawing code, so
// an image-to-image model trained on Detect Pose output sees the same
// picture from motion capture. The `rokoko` skeleton draws the joints as
// the stream sends them.
const skeletonIn = node.selectIn('skeleton', ['pose', 'rokoko'], 'pose');
const drawing = figment.skeletonPorts(node); // shared with Detect Pose

const widthIn = node.numberIn('width', 1920);
const heightIn = node.numberIn('height', 1080);

const cameraXIn = node.numberIn('camera X', 0, { min: -10, max: 10, step: 0.1 });
const cameraYIn = node.numberIn('camera Y', 1, { min: -10, max: 10, step: 0.1 });
const cameraZIn = node.numberIn('camera Z', 3, { min: -10, max: 10, step: 0.1 });
const fovIn = node.numberIn('field of view', 60, { min: 10, max: 120 });
const treadmillIn = node.toggleIn('treadmill', false);

const udpPortIn = node.numberIn('udp port', 14043);
udpPortIn.label = 'UDP port';

const imageOut = node.imageOut('out');
const detectedOut = node.booleanOut('detected');
const landmarksOut = node.objectOut('landmarks');

let _target, _overlay;
let _currentBody = null;

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

widthIn.onChange = drawResults;
heightIn.onChange = drawResults;
skeletonIn.onChange = drawResults;

node.onStart = async () => {
  _target = new figment.RenderTarget({ label: 'receiveRokoko' });
  _overlay = new figment.LandmarkRenderer({ label: 'receiveRokoko' });

  drawResults(); // initial blank frame

  // UDP listener setup
  _listener = (name, args) => {
    if (name !== 'message') return;
    if (args.port !== udpPortIn.value) return;
    const data = new Uint8Array(args.data);
    const decoded = lz4Decompress(data);
    if (!decoded) return;
    const text = new TextDecoder().decode(decoded);
    try {
      const json = JSON.parse(text);
      const body = json?.scene?.actors?.[0]?.body;
      if (!body) return;
      _currentBody = body;
      drawResults();
      if (node.network) {
        node.network.markNodeDirty(node);
      }
    } catch (e) {
      console.error('Failed to parse Rokoko data:', e);
    }
  };
  window.desktop.registerListener('udp', _listener);
  window.desktop.startUdpServer(udpPortIn.value);
};

node.onStop = () => {
  _target?.destroy();
  _overlay?.destroy();
  _target = null;
  _overlay = null;
  window.desktop.registerListener('udp', null);
  window.desktop.stopUdpServer(udpPortIn.value);
};

node.onRender = () => {};

udpPortIn.onChange = (oldPort, newPort) => {
  window.desktop.stopUdpServer(oldPort);
  window.desktop.startUdpServer(newPort);
};

//// DRAWING ////

function drawResults() {
  if (!_overlay) return;
  const width = widthIn.value;
  const height = heightIn.value;
  const batch = _overlay.begin(width, height);

  const projected = _currentBody ? _projectBody(_currentBody, width, height) : null;
  if (projected) {
    const { landmarks, skeleton, type } = projected;
    detectedOut.set(true);
    landmarksOut.set(type === 'pose' ? { type, landmarks: [landmarks] } : { type, body: _currentBody });
    // Joints behind the camera get visibility 0; hide them and their bones.
    figment.drawSkeleton(batch, landmarks, skeleton, { ...figment.skeletonStyle(drawing), visibilityMin: 0 });
  } else {
    detectedOut.set(false);
    landmarksOut.set(null);
  }

  _overlay.draw(_target, drawing.background.value);
  imageOut.set(_target);
}

// The body's joints as 2D landmarks in the chosen skeleton, with the
// connection table to draw them, or null without a usable body.
function _projectBody(body, width, height) {
  const joints = body || {};
  if (!joints.hip?.position) return null;

  const type = skeletonIn.value;
  let positions, skeleton;
  if (type === 'pose') {
    positions = figment.rokokoToPose(joints);
    if (!positions) return null;
    skeleton = figment.SKELETONS.pose;
  } else {
    const names = Object.keys(joints);
    positions = names.map((name) => joints[name]?.position || { x: 0, y: 0, z: 0 });
    const nameToIdx = Object.fromEntries(names.map((name, i) => [name, i]));
    const connections = ROKOKO_BODY_CONNECTIONS.map(([p, c]) => [nameToIdx[p], nameToIdx[c]]).filter(
      (pair) => pair[0] !== undefined && pair[1] !== undefined,
    );
    skeleton = { connections };
  }

  // Center model at origin using hip position if treadmill is on
  const center = treadmillIn.value ? joints.hip.position : { x: 0, y: 0, z: 0 };
  const positions3D = positions.map((pos) => ({
    x: -((pos.x ?? 0) - (center.x ?? 0)),
    y: (pos.y ?? 0) - (center.y ?? 0),
    z: (pos.z ?? 0) - (center.z ?? 0),
  }));

  // Get camera parameters
  const cameraPos = { x: cameraXIn.value, y: cameraYIn.value, z: cameraZIn.value };
  const fov = fovIn.value * (Math.PI / 180);

  // Project 3D points to 2D landmarks
  const landmarks = positions3D.map((pos) => {
    const projected = perspectiveProjectPoint(pos, cameraPos, fov, width, height);
    return {
      x: projected.x,
      y: projected.y,
      visibility: projected.visible ? 1 : 0,
    };
  });

  return { landmarks, skeleton, type };
}

function perspectiveProjectPoint(point, cameraPos, fov, width, height) {
  const aspect = width / height;
  const near = 0.1;

  // 1. Translate world by camera's inverse position.
  const p_cam = {
    x: point.x - cameraPos.x,
    y: point.y - cameraPos.y,
    z: point.z - cameraPos.z,
  };

  // 2. Perspective Projection (looking down -Z axis)
  if (p_cam.z >= -near) {
    return { x: 0.5, y: 0.5, visible: false }; // Clip if behind or too close
  }
  const z_dist = -p_cam.z;

  const scaleY = 1 / Math.tan(fov / 2);
  const scaleX = scaleY / aspect;

  const x_ndc = (p_cam.x * scaleX) / z_dist;
  const y_ndc = (p_cam.y * scaleY) / z_dist;

  // 3. Viewport transform (NDC [-1, 1] to screen space [0, 1])
  const x = 0.5 + x_ndc / 2;
  const y = 0.5 - y_ndc / 2;

  // Points outside the frame keep their coordinates, as Detect Pose's
  // landmarks do, so a limb that leaves the frame draws toward its real
  // position instead of bending to the edge.
  return { x, y, visible: true };
}

//// LZ4 DECOMPRESSION ////

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
