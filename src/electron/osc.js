import { Server, Client } from 'node-osc';

const _oscClients = {};

const MAX_MESSAGE_FREQUENCY = 30;
export const oscMessageMap = new Map();
export const messageFrequencies = [];

export function oscSendMessage(ip, port, address, args) {
  // console.log('osc send message', ip, port, address, args);
  const clientKey = `${ip}:${port}`;
  let client = _oscClients[clientKey];
  if (!client) {
    client = new Client(ip, port);
    _oscClients[clientKey] = client;
  }
  client.send(address, ...args);
}

export function oscStartServer(port, sender) {
  const server = new Server(port, '0.0.0.0');
  messageFrequencies.length = 0;
  messageFrequencies.push(0);
  server.on('message', (msg) => {
    messageFrequencies[messageFrequencies.length - 1]++;
    const address = msg[0];
    const args = msg.slice(1);
    if (args.length === 1) {
      oscMessageMap.set(address, args[0]);
    } else {
      oscMessageMap.set(address, args);
    }
  });
  const timer = setInterval(() => {
    messageFrequencies.push(0);
    while (messageFrequencies.length > MAX_MESSAGE_FREQUENCY) {
      // Remove the first element
      messageFrequencies.shift();
    }
    sender.send('osc', 'message-frequencies', messageFrequencies);
  }, 2000);
  return { server, timer };
}

export function oscStopServer({ server, timer }) {
  server.close();
  clearInterval(timer);
}
