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
    const decoded = lz4Decode(data);
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

function lz4Decode(input) {
  const src = new Uint8Array(input);
  let pos = 0;
  const out = [];
  while (pos < src.length) {
    const token = src[pos++];
    let litLength = token >> 4;
    if (litLength === 15) {
      let b;
      do {
        b = src[pos++];
        litLength += b;
      } while (b === 255);
    }
    for (let i = 0; i < litLength; i++) {
      out.push(src[pos++]);
    }
    if (pos >= src.length) break;
    const offset = src[pos] | (src[pos + 1] << 8);
    pos += 2;
    let matchLength = token & 0x0f;
    if (matchLength === 15) {
      let b;
      do {
        b = src[pos++];
        matchLength += b;
      } while (b === 255);
    }
    matchLength += 4;
    const start = out.length - offset;
    for (let i = 0; i < matchLength; i++) {
      out.push(out[start + i]);
    }
  }
  return new Uint8Array(out);
}
