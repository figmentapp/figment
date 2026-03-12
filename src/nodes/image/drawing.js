/**
 * @name Drawing
 * @description Draw into a bitmap canvas in an external browser window.
 * @category image
 */

const widthIn = node.numberIn('width', 512, { min: 1, max: 4096, step: 1 });
const heightIn = node.numberIn('height', 512, { min: 1, max: 4096, step: 1 });
const openIn = node.triggerButtonIn('open drawing');
const clearIn = node.triggerButtonIn('clear');
const imageOut = node.imageOut('image');

let _target, _canvas, _ctx;
let _serverPort = null;

function makeHtml(width, height) {
  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>Drawing</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { background: #0d0f16; display: flex; align-items: center; justify-content: center; height: 100vh; overflow: hidden; }
  #workspace { display: flex; align-items: stretch; gap: 8px; }
  canvas { cursor: crosshair; display: block; }
  #toolbar { display: flex; flex-direction: column; align-items: center; gap: 6px; }
  .tool-btn { width: 32px; height: 32px; border: 2px solid #555; border-radius: 6px; cursor: pointer; display: flex; align-items: center; justify-content: center; background: none; }
  .tool-btn:hover { border-color: #888; }
  .tool-btn.active { border-color: #fff; }
  .brush-dot { border-radius: 50%; background: #fff; }
  .color-swatch { width: 20px; height: 20px; border-radius: 3px; }
  .spacer { flex: 1; }
  #clear-btn { width: 32px; height: 32px; border: 2px solid #555; border-radius: 6px; cursor: pointer; background: none; color: #888; font-size: 16px; display: flex; align-items: center; justify-content: center; }
  #clear-btn:hover { border-color: #f55; color: #f55; }
</style>
</head>
<body>
<div id="workspace">
  <canvas id="c" width="${width}" height="${height}"></canvas>
  <div id="toolbar"></div>
</div>
<script>
(function() {
  const canvas = document.getElementById('c');
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  let brushSize = 2;
  let brushColor = '#ffffff';
  let drawing = false;

  const brushes = [
    { size: 2, label: '2' },
    { size: 4, label: '4' },
    { size: 8, label: '8' },
  ];
  const colors = [
    { color: '#ffffff', label: 'W' },
    { color: '#000000', label: 'B' },
  ];

  const toolbar = document.getElementById('toolbar');

  brushes.forEach(b => {
    const btn = document.createElement('button');
    btn.className = 'tool-btn' + (b.size === brushSize ? ' active' : '');
    btn.dataset.type = 'brush';
    btn.dataset.size = b.size;
    const dot = document.createElement('span');
    dot.className = 'brush-dot';
    dot.style.width = b.size + 'px';
    dot.style.height = b.size + 'px';
    btn.appendChild(dot);
    btn.onclick = () => {
      brushSize = b.size;
      document.querySelectorAll('[data-type="brush"]').forEach(el => el.classList.remove('active'));
      btn.classList.add('active');
    };
    toolbar.appendChild(btn);
  });

  colors.forEach(c => {
    const btn = document.createElement('button');
    btn.className = 'tool-btn' + (c.color === brushColor ? ' active' : '');
    btn.dataset.type = 'color';
    const swatch = document.createElement('span');
    swatch.className = 'color-swatch';
    swatch.style.background = c.color;
    btn.appendChild(swatch);
    btn.onclick = () => {
      brushColor = c.color;
      document.querySelectorAll('[data-type="color"]').forEach(el => el.classList.remove('active'));
      btn.classList.add('active');
    };
    toolbar.appendChild(btn);
  });

  // Spacer pushes clear button to bottom
  const spacer = document.createElement('div');
  spacer.className = 'spacer';
  toolbar.appendChild(spacer);

  // Clear button
  const clearBtn = document.createElement('button');
  clearBtn.id = 'clear-btn';
  clearBtn.innerHTML = '\u00d7';
  clearBtn.title = 'Clear canvas';
  clearBtn.onclick = () => {
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    sendCanvas();
  };
  toolbar.appendChild(clearBtn);

  // Drawing
  let lastX, lastY;
  let sendTimer = null;

  function scheduleSend() {
    if (sendTimer) return;
    sendTimer = setTimeout(() => {
      sendTimer = null;
      sendCanvas();
    }, 100);
  }

  canvas.addEventListener('pointerdown', e => {
    drawing = true;
    const rect = canvas.getBoundingClientRect();
    lastX = (e.clientX - rect.left) * (canvas.width / rect.width);
    lastY = (e.clientY - rect.top) * (canvas.height / rect.height);
    ctx.beginPath();
    ctx.arc(lastX, lastY, brushSize / 2, 0, Math.PI * 2);
    ctx.fillStyle = brushColor;
    ctx.fill();
    scheduleSend();
  });

  canvas.addEventListener('pointermove', e => {
    if (!drawing) return;
    const rect = canvas.getBoundingClientRect();
    const x = (e.clientX - rect.left) * (canvas.width / rect.width);
    const y = (e.clientY - rect.top) * (canvas.height / rect.height);
    ctx.beginPath();
    ctx.moveTo(lastX, lastY);
    ctx.lineTo(x, y);
    ctx.strokeStyle = brushColor;
    ctx.lineWidth = brushSize;
    ctx.lineCap = 'round';
    ctx.stroke();
    lastX = x;
    lastY = y;
    scheduleSend();
  });

  function endStroke() {
    if (!drawing) return;
    drawing = false;
    if (sendTimer) { clearTimeout(sendTimer); sendTimer = null; }
    sendCanvas();
  }

  canvas.addEventListener('pointerup', endStroke);
  canvas.addEventListener('pointerleave', endStroke);

  // WebSocket — connect to the same host that served this page
  let ws;
  function connect() {
    ws = new WebSocket('ws://' + window.location.host);
    ws.binaryType = 'arraybuffer';
    ws.onopen = () => ws.send(JSON.stringify({ type: 'hello' }));
    ws.onmessage = e => {
      if (e.data instanceof ArrayBuffer) {
        // Restore: node sent current canvas state
        const arr = new Uint8ClampedArray(e.data);
        if (arr.length === canvas.width * canvas.height * 4) {
          const img = new ImageData(arr, canvas.width, canvas.height);
          ctx.putImageData(img, 0, 0);
        }
      } else if (typeof e.data === 'string') {
        const msg = JSON.parse(e.data);
        if (msg.type === 'clear') {
          ctx.fillStyle = '#000';
          ctx.fillRect(0, 0, canvas.width, canvas.height);
        } else if (msg.type === 'resize') {
          canvas.width = msg.width;
          canvas.height = msg.height;
          ctx.fillStyle = '#000';
          ctx.fillRect(0, 0, canvas.width, canvas.height);
          sendCanvas();
        }
      }
    };
    ws.onclose = () => setTimeout(connect, 1000);
  }
  connect();

  function sendCanvas() {
    if (!ws || ws.readyState !== 1) return;
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    ws.send(imageData.data.buffer);
  }
})();
</script>
</body>
</html>`;
}

function resizeCanvas() {
  const width = widthIn.value;
  const height = heightIn.value;

  if (_canvas && _canvas.width === width && _canvas.height === height) return;

  _canvas = new OffscreenCanvas(width, height);
  _ctx = _canvas.getContext('2d');
  _ctx.fillStyle = '#000000';
  _ctx.fillRect(0, 0, width, height);

  if (_target) {
    _target.setSize(width, height);
    _target.uploadExternal(_canvas);
    imageOut.set(_target);
  }
}

widthIn.onChange = () => {
  resizeCanvas();
  sendResizeToBrowser();
};
heightIn.onChange = () => {
  resizeCanvas();
  sendResizeToBrowser();
};

function sendResizeToBrowser() {
  if (_serverPort !== null) {
    window.desktop.sendToNodeServer(node.id, JSON.stringify({ type: 'resize', width: widthIn.value, height: heightIn.value }));
  }
}

node.onStart = async () => {
  _target = new figment.RenderTarget({ label: 'drawing' });
  resizeCanvas();

  window.desktop.registerNodeServerListener(node.id, (data) => {
    if (typeof data === 'string') {
      try {
        const msg = JSON.parse(data);
        if (msg.type === 'hello') {
          // New browser connected — send current canvas state to restore drawing
          const imgData = _ctx.getImageData(0, 0, _canvas.width, _canvas.height);
          window.desktop.sendToNodeServer(node.id, Array.from(imgData.data));
        }
      } catch (_) {}
      return;
    }
    const bytes = new Uint8Array(data);
    const width = widthIn.value;
    const height = heightIn.value;
    const expected = width * height * 4;
    if (bytes.length !== expected) return;
    // Keep local canvas in sync so we can restore on reconnect
    const imgData = new ImageData(new Uint8ClampedArray(bytes.buffer), width, height);
    _ctx.putImageData(imgData, 0, 0);
    _target.uploadBytes(bytes);
    imageOut.set(_target);
    if (node.network) {
      node.network.markNodeDirty(node);
    }
  });

  // Start server after output is set so downstream nodes get the initial black frame
  const { port } = await window.desktop.startNodeServer(node.id, makeHtml(widthIn.value, heightIn.value));
  _serverPort = port;
};

openIn.onTrigger = () => {
  window.desktop.openExternal(`http://localhost:${_serverPort}`);
};

clearIn.onTrigger = () => {
  if (_ctx) {
    _ctx.fillStyle = '#000000';
    _ctx.fillRect(0, 0, _canvas.width, _canvas.height);
    _target.uploadExternal(_canvas);
    imageOut.set(_target);
    if (node.network) {
      node.network.markNodeDirty(node);
    }
  }
  if (_serverPort !== null) {
    window.desktop.sendToNodeServer(node.id, JSON.stringify({ type: 'clear' }));
  }
};

node.onStop = () => {
  window.desktop.stopNodeServer(node.id);
  _serverPort = null;
  _target?.destroy();
  _target = null;
  window.desktop.unregisterNodeServerListener(node.id);
};

node.onRender = () => {};
