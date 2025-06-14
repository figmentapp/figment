import { Server, Client } from 'node-osc';

const _oscClients = {};

const MAX_MESSAGE_FREQUENCY = 30;
export const messageFrequencies = [];

export function oscSendMessage(ip, port, address, args) {
  const clientKey = `${ip}:${port}`;
  let client = _oscClients[clientKey];
  if (!client) {
    client = new Client(ip, port);
    _oscClients[clientKey] = client;
  }
  client.send(address, ...args);
}

export function oscStartServer(port, sendIpcMessage) {
  const server = new Server(port, '0.0.0.0');
  messageFrequencies.length = 0;
  messageFrequencies.push(0);
  server.on('message', (msg) => {
    messageFrequencies[messageFrequencies.length - 1]++;
    const address = msg[0];
    const args = msg.slice(1);
    sendIpcMessage('osc', 'message', { address, args });
  });
  server.on('bundle', (bundle) => {
    messageFrequencies[messageFrequencies.length - 1]++;
    bundle.elements.forEach((element, i) => {
      const address = element[0];
      const args = element.slice(1);
      sendIpcMessage('osc', 'message', {
        address,
        args,
      });
    });
  });
  const timer = setInterval(() => {
    messageFrequencies.push(0);
    while (messageFrequencies.length > MAX_MESSAGE_FREQUENCY) {
      // Remove the first element
      messageFrequencies.shift();
    }
    sendIpcMessage('osc', 'message-frequencies', messageFrequencies);
  }, 2000);
  return { server, timer };
}

export function oscStopServer({ server, timer }) {
  server.close();
  clearInterval(timer);
}
