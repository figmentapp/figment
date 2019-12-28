import Node from './Node';
import * as sources from './sources';

export const DEFAULT_NETWORK = {
  nodes: [
    {
      id: 1,
      name: 'Canvas',
      type: 'core.canvas',
      source: sources.sourceCanvas,
      x: 50,
      y: 50
    },
    {
      id: 2,
      name: 'Background Color',
      type: 'core.backgroundColor',
      source: sources.sourceBackgroundColor,
      x: 50,
      y: 100
    },
    {
      id: 3,
      name: 'Sequence',
      type: 'core.sequence',
      source: sources.sourceSequence,
      x: 50,
      y: 150
    },
    {
      id: 4,
      name: 'Rectangle',
      type: 'core.rect',
      source: sources.sourceRect,
      x: 50,
      y: 300
    },
    {
      id: 5,
      name: 'Rectangle',
      type: 'core.rect',
      source: sources.sourceRect,
      x: 250,
      y: 300,
      values: {
        position: [150, 150],
        color: [200, 200, 200, 1]
      }
    }
  ],
  connections: [
    { outNode: 1, inNode: 2, outPort: 'out', inPort: 'in' },
    { outNode: 2, inNode: 3, outPort: 'out', inPort: 'in' },
    { outNode: 3, inNode: 4, outPort: 'out1', inPort: 'in' },
    { outNode: 3, inNode: 5, outPort: 'out2', inPort: 'in' }
  ]
};

export default class Network {
  constructor() {
    this.nodes = [];
    this.connections = [];
  }

  parse(obj) {
    for (const nodeObj of obj.nodes) {
      const node = new Node(this, nodeObj.id, nodeObj.name, nodeObj.type, nodeObj.x, nodeObj.y);
      node.source = nodeObj.source.trim();
      node.function = new Function('node', node.source);
      node.function.call(window, node);
      if (nodeObj.values) {
        for (const portName of Object.keys(nodeObj.values)) {
          const value = nodeObj.values[portName];
          const port = node.inPorts.find(p => p.name === portName);
          if (port.type === 'float') {
            port.value = value;
          } else if (port.type === 'point') {
            port.value = new g.Point(value[0], value[1]);
          } else if (port.type === 'color') {
            port.value = value.slice();
          } else {
            throw new Error(`Unsupported port type ${port.name} ${port.type} ${value}`);
          }
        }
      }
      this.nodes.push(node);
    }
    for (const connObj of obj.connections) {
      this.connections.push(connObj);
    }
  }

  start() {
    for (const node of this.nodes) {
      if (node.onStart) {
        node.onStart(node);
      }
    }
  }

  stop() {
    for (const node of this.nodes) {
      if (node.onStop) {
        node.onStop(node);
      }
    }
  }

  restart() {
    this.stop();
    for (const node of this.nodes) {
      node.function = new Function('node', node.source);
      node.function.call(window, node);
    }
    this.start();
  }

  doFrame() {
    for (const node of this.nodes) {
      if (node.onFrame) {
        node.onFrame(node);
      }
    }
  }

  setNodeSource(node, source) {
    if (node.onStop) {
      node.onStop(node);
    }
    node.source = source;
    node.function = new Function('node', node.source);
    node.function.call(window, node);
    if (node.onStart) {
      node.onStart(node);
    }
    this.doFrame();
  }

  setPortValue(node, portName, value) {
    const port = node.inPorts.find(p => p.name === portName);
    console.assert(port, `Port ${name} does not exist.`);
    port.value = value;
    this.doFrame();
  }
}
