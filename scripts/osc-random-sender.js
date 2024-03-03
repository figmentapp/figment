import { Client } from 'node-osc';

function main() {
  setInterval(() => {
    if (Math.random() > 0.5) {
      const client = new Client('127.0.0.1', 8888);
      client.send('/alpha', 200, () => {
        client.close();
      });
    }
  }, 10);
}

main();
