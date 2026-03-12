import http from 'node:http';
import { WebSocketServer } from 'ws';

// Map<nodeId, { httpServer, wss, port }>
const _servers = new Map();

export function nodeServerStart(nodeId, html, sendIpcMessage) {
  // Stop existing server for this node if any
  if (_servers.has(nodeId)) {
    nodeServerStop(nodeId);
  }

  const httpServer = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(html);
  });

  const wss = new WebSocketServer({ server: httpServer });

  wss.on('connection', (ws) => {
    ws.on('message', (data, isBinary) => {
      if (isBinary) {
        // Send as ArrayBuffer for binary data (e.g. RGBA pixels)
        sendIpcMessage('node-server', nodeId, Array.from(new Uint8Array(data)));
      } else {
        sendIpcMessage('node-server', nodeId, data.toString());
      }
    });
  });

  return new Promise((resolve) => {
    httpServer.listen(0, () => {
      const port = httpServer.address().port;
      _servers.set(nodeId, { httpServer, wss, port });
      resolve({ port });
    });
  });
}

export function nodeServerStop(nodeId) {
  const entry = _servers.get(nodeId);
  if (!entry) return;
  entry.wss.close();
  entry.httpServer.close();
  _servers.delete(nodeId);
}

export function nodeServerSend(nodeId, data) {
  const entry = _servers.get(nodeId);
  if (!entry) return;
  // Convert number arrays back to binary buffers
  const payload = Array.isArray(data) ? Buffer.from(data) : data;
  for (const client of entry.wss.clients) {
    if (client.readyState === 1) {
      client.send(payload);
    }
  }
}

export function nodeServerStopAll() {
  for (const nodeId of _servers.keys()) {
    nodeServerStop(nodeId);
  }
}
