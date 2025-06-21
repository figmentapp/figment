/**
 * @name Receive Rokoko
 * @description Receive realtime motion capture data from Rokoko Studio.
 * @category comms
 */

const portIn = node.numberIn('port', 14043, { min: 0, max: 65535 });
const bodyOut = node.objectOut('body');

let _listener;

node.onStart = () => {
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
      if (body) bodyOut.set(body);
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

portIn.onChange = (oldV, newV) => {
  window.desktop.stopUdpServer(oldV);
  window.desktop.startUdpServer(newV);
};

function lz4Decompress(src, maxSize = 64 << 20) {
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
