import Node from './Node';
import * as sources from './sources';
import Port, {
  PORT_TYPE_TRIGGER,
  PORT_TYPE_BUTTON,
  PORT_TYPE_NUMBER,
  PORT_TYPE_POINT,
  PORT_TYPE_COLOR,
} from './Port';

export const DEFAULT_NETWORK = {
  nodes: [
    {
      id: 1,
      name: 'Canvas',
      type: 'graphics.canvas',
      x: 50,
      y: 50
    },
    {
      id: 2,
      name: 'Background Color',
      type: 'graphics.backgroundColor',
      x: 50,
      y: 100
    },
    {
      id: 3,
      name: 'Sequence',
      type: 'core.sequence',
      x: 50,
      y: 150
    },
    {
      id: 4,
      name: 'Rectangle',
      type: 'graphics.rect',
      x: 50,
      y: 300
    },
    {
      id: 5,
      name: 'Rectangle',
      type: 'graphics.rect',
      x: 250,
      y: 300,
      values: {
        position: [150, 150],
        color: [200, 200, 200, 1]
      }
    }
  ],
  connections: [
    { outNode: 1, outPort: 'out', inNode: 2, inPort: 'in' },
    { outNode: 2, outPort: 'out', inNode: 3, inPort: 'in' },
    { outNode: 3, outPort: 'out1', inNode: 4, inPort: 'in' },
    { outNode: 3, outPort: 'out2', inNode: 5, inPort: 'in' }
  ]
};

export default class Network {
  constructor(library) {
    this.library = library;
    this.nodes = [];
    this.connections = [];
    this._id = 0;
  }

  _nextId() {
    return ++this._id;
  }

  createNode(typeId, x, y, options) {
    if (typeof typeId !== 'string') {
      debugger;
    }
    console.assert(typeof typeId === 'string');
    options = options || {};
    let id;
    if (typeof options.id === 'number') {
      id = options.id;
      this._id = Math.max(this._id, id);
    } else {
      id = this._nextId();
    }
    const nodeType = this.library.findByType(typeId);
    const node = new Node(this, id, nodeType.name, nodeType.type, x, y);
    const source = nodeType.source;
    const fn = new Function('node', source);
    fn.call(window, node);
    this.nodes.push(node);
    return node;
  }

  parse(obj) {
    for (const nodeObj of obj.nodes) {
      const node = this.createNode(nodeObj.type, nodeObj.x, nodeObj.y, { id: nodeObj.id });
      node.name = nodeObj.name;
      // const node = new Node(this, nodeObj.id, nodeObj.name, nodeObj.type, nodeObj.x, nodeObj.y);
      // node.source = nodeObj.source.trim();
      // node.function = new Function('node', node.source);
      // node.function.call(window, node);
      if (nodeObj.values) {
        for (const portName of Object.keys(nodeObj.values)) {
          const value = nodeObj.values[portName];
          const port = node.inPorts.find(p => p.name === portName);
          if (port.type === PORT_TYPE_NUMBER) {
            port.value = value;
          } else if (port.type === PORT_TYPE_POINT) {
            port.value = new g.Point(value[0], value[1]);
          } else if (port.type === PORT_TYPE_COLOR) {
            port.value = value.slice();
          } else {
            throw new Error(`Unsupported port type ${port.name} ${port.type} ${value}`);
          }
        }
      }
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

  // restart() {
  //   this.stop();
  //   for (const node of this.nodes) {
  //     node.function = new Function('node', node.source);
  //     node.function.call(window, node);
  //   }
  //   this.start();
  // }

  doFrame() {
    for (const node of this.nodes) {
      if (node.onFrame) {
        node.onFrame(node);
      }
    }
  }

  setNodeTypeSource(nodeType, source) {
    console.assert(typeof nodeType === 'object');
    // Find all nodes with this source type.
    const nodes = this.nodes.filter(n => n.type === nodeType.type);
    nodeType.source = source;
    const fn = new Function('node', nodeType.source);
    for (const node of nodes) {
      if (node.onStop) {
        node.onStop(node);
      }
      fn.call(window, node);
      if (node.onStart) {
        node.onStart(node);
      }
    }

    this.doFrame();
  }

  setPortValue(node, portName, value) {
    const port = node.inPorts.find(p => p.name === portName);
    console.assert(port, `Port ${name} does not exist.`);
    port.value = value;
    if (port.onChange) {
      port.onChange();
    }
    this.doFrame();
  }

  triggerButton(node, port) {
    if (port.onTrigger) {
      port.onTrigger();
    }
    this.doFrame();
  }

  connect(outNode, outPort, inNode, inPort) {
    const conn = {
      outNode: outNode.id,
      outPort: outPort.name,
      inNode: inNode.id,
      inPort: inPort.name
    };
    this.connections.push(conn);
  }
}
