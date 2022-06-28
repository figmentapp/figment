const { Client } = require('node-osc');

const _oscClients = {};

function oscSendMessage(ip, port, address, args) {
  // console.log('osc send message', ip, port, address, args);
  const clientKey = `${ip}:${port}`;
  let client = _oscClients[clientKey];
  if (!client) {
    client = new Client(ip, port);
    _oscClients[clientKey] = client;
  }
  client.send(address, ...args);
}

module.exports = { oscSendMessage };
