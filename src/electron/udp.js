import dgram from 'dgram';

const _udpClients = {};
const _udpServers = new Map();

export function udpSendMessage(ip, port, buffer) {
  const clientKey = `${ip}:${port}`;
  let client = _udpClients[clientKey];
  if (!client) {
    client = dgram.createSocket('udp4');
    _udpClients[clientKey] = client;
  }
  client.send(buffer, port, ip);
}

export function udpStartServer(port, sendIpcMessage) {
  let server = _udpServers.get(port);
  if (!server) {
    server = dgram.createSocket('udp4');
    server.on('message', (msg) => {
      sendIpcMessage('udp', 'message', { port, data: msg });
    });
    server.on('error', (err) => {
      console.error('UDP server error', err);
    });
    server.bind(port);
    _udpServers.set(port, server);
  }
  return server;
}

export function udpStopServer(port) {
  const server = _udpServers.get(port);
  if (!server) return;
  server.close();
  _udpServers.delete(port);
}
