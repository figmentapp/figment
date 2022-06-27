const { Client } = require('node-osc');

const _oscClients = {};

function oscSendMessage(ip, port, address, args) {
  console.log('osc send message', ip, port, address, args);
  const clientKey = `${ip}:${port}`;
  const client = _oscClients[clientKey];
  if (!client) {
    const client = new Client(ip, port);
    _oscClients[clientKey] = client;
  }
  client.send(address, args);
}

module.exports = { oscSendMessage };
