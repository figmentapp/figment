import Node from './Node';
import * as sources from './sources';
import Port, {
  PORT_TYPE_TRIGGER,
  PORT_TYPE_TOGGLE,
  PORT_TYPE_BUTTON,
  PORT_TYPE_NUMBER,
  PORT_TYPE_STRING,
  PORT_TYPE_SELECT,
  PORT_TYPE_POINT,
  PORT_TYPE_COLOR,
  PORT_TYPE_FILE,
  PORT_TYPE_IMAGE,
  PORT_IN,
  PORT_OUT,
} from './Port';

// export const DEFAULT_NETWORK = {
//   nodes: [
//     {
//       id: 1,
//       name: 'Canvas',
//       type: 'graphics.canvas',
//       x: 50,
//       y: 50
//     },
//     {
//       id: 2,
//       name: 'Sequence',
//       type: 'core.sequence',
//       x: 50,
//       y: 150
//     },
//     {
//       id: 3,
//       name: 'Rectangle',
//       type: 'graphics.rect',
//       x: 50,
//       y: 300,
//       values: {
//         x: 50,
//         y: 50
//       }
//     }
//   ],
//   connections: [
//     { outNode: 1, outPort: 'out', inNode: 2, inPort: 'in' },
//     { outNode: 2, outPort: 'out1', inNode: 3, inPort: 'in' }
//   ]
// };

export const DEFAULT_NETWORK_OLD = {
  nodes: [
    {
      id: 1,
      name: 'Constant',
      type: 'image.constant',
      x: 50,
      y: 50,
      values: {
        color: [255, 255, 255, 1],
        width: 100,
        height: 100,
      },
    },
    {
      id: 5,
      name: 'Constant',
      type: 'image.constant',
      x: 50,
      y: 150,
      values: {
        color: [255, 255, 255, 1],
        width: 300,
        height: 100,
      },
    },
    {
      id: 6,
      name: 'Constant',
      type: 'image.constant',
      x: 50,
      y: 250,
      values: {
        color: [255, 255, 255, 1],
        width: 100,
        height: 300,
      },
    },
    {
      id: 2,
      name: 'Load Image',
      type: 'image.loadImage',
      x: 250,
      y: 50,
      values: {
        file: 'examples/assets/kriskross.png',
      },
    },
    {
      id: 3,
      name: 'Mirror',
      type: 'image.mirror',
      x: 250,
      y: 300,
    },
    {
      id: 7,
      name: 'Invert',
      type: 'image.invert',
      x: 100,
      y: 500,
    },
    {
      id: 8,
      name: 'Sobel',
      type: 'image.sobel',
      x: 100,
      y: 400,
    },
    {
      id: 9,
      name: 'Threshold',
      type: 'image.threshold',
      x: 150,
      y: 600,
    },
    {
      id: 10,
      name: 'Greyscale',
      type: 'image.greyscale',
      x: 300,
      y: 220,
    },
    {
      id: 11,
      name: 'Modcolor',
      type: 'image.modcolor',
      x: 300,
      y: 150,
    },

    // {
    //   id: 2,
    //   name: 'Sequence',
    //   type: 'core.sequence',
    //   x: 50,
    //   y: 150
    // },
    // {
    //   id: 3,
    //   name: 'Rectangle',
    //   type: 'graphics.rect',
    //   x: 50,
    //   y: 300,
    //   values: {
    //     x: 50,
    //     y: 50
    //   }
    // }
  ],
  connections: [
    { outNode: 2, outPort: 'out', inNode: 3, inPort: 'in' },
    { outNode: 2, outPort: 'out', inNode: 8, inPort: 'in' },
    { outNode: 8, outPort: 'out', inNode: 7, inPort: 'in' },
    { outNode: 7, outPort: 'out', inNode: 9, inPort: 'in' },
    { outNode: 2, outPort: 'out', inNode: 10, inPort: 'in' },
    { outNode: 2, outPort: 'out', inNode: 11, inPort: 'in' },
    // { outNode: 2, outPort: 'out1', inNode: 3, inPort: 'in' }
  ],
};

export const DEFAULT_NETWORK = {
  nodes: [
    {
      id: 1,
      name: 'Constant',
      type: 'image.constant',
      x: 50,
      y: 50,
      values: {
        color: [255, 0, 255, 1],
        width: 512,
        height: 512,
      },
    },
    {
      id: 2,
      name: 'Invert',
      type: 'image.invert',
      x: 100,
      y: 500,
    },
  ],
  connections: [{ outNode: 1, outPort: 'out', inNode: 2, inPort: 'in' }],
};

export default class Network {
  constructor(library) {
    this.started = false;
    this.library = library;
    this.nodes = [];
    this.connections = [];
    this.types = [];
    this._id = 0;
  }

  _nextId() {
    return ++this._id;
  }

  findNodeType(typeId) {
    let nodeType;
    nodeType = this.types.find((type) => type.type === typeId);
    if (nodeType) return nodeType;
    nodeType = this.library.findByType(typeId);
    if (nodeType) return nodeType;
    console.warn(`Could not find nodeType ${nodeType}`);
  }

  allNodeTypes() {
    const nodeTypes = [];
    nodeTypes.push(...this.types);
    nodeTypes.push(...this.library.nodeTypes);
    return nodeTypes;
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
    const nodeType = this.findNodeType(typeId);
    if (!nodeType) {
      console.warn(`Could not find nodeType ${typeId}.`);
      return;
    }
    const node = new Node(this, id, nodeType.name, nodeType.type, x, y);
    const source = nodeType.source;
    try {
      const fn = new Function('node', source);
      fn.call(window, node);
    } catch (e) {
      console.error(e && e.stack);
    }

    this.nodes.push(node);
    if (this.started) {
      this._startNode(node);
    }
    return node;
  }

  parse(obj) {
    const warnings = [];
    if (Array.isArray(obj.types)) {
      for (const typeObj of obj.types) {
        this.types.push(typeObj);
      }
    }
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
          const port = node.inPorts.find((p) => p.name === portName);
          if (!port) {
            warnings.push(`Node ${node.name} (${node.id}): Could not find port ${portName}.`);
            continue;
          }
          if (port.type === PORT_TYPE_TOGGLE) {
            port.value = value;
          } else if (port.type === PORT_TYPE_NUMBER) {
            port.value = value;
          } else if (port.type === PORT_TYPE_STRING) {
            port.value = value;
          } else if (port.type === PORT_TYPE_SELECT) {
            port.value = value;
          } else if (port.type === PORT_TYPE_POINT) {
            port.value = new g.Point(value[0], value[1]);
          } else if (port.type === PORT_TYPE_COLOR) {
            port.value = value.slice();
          } else if (port.type === PORT_TYPE_FILE) {
            port.value = value;
          } else {
            warnings.push(
              `Node ${node.name} (${node.id}) - port ${portName}: unsupported port type ${port.type} ${value}.`
            );
          }
        }
      }
    }
    for (const connObj of obj.connections) {
      const outNode = this.nodes.find((node) => node.id === connObj.outNode);
      if (!outNode) {
        warnings.push(`Connection ${JSON.stringify(connObj)}: output node does not exist.`);
        continue;
      }
      const inNode = this.nodes.find((node) => node.id === connObj.inNode);
      if (!inNode) {
        warnings.push(`Connection ${JSON.stringify(connObj)}: input node does not exist.`);
        continue;
      }
      const outPort = outNode.outPorts.find((port) => port.name === connObj.outPort);
      if (!outPort) {
        warnings.push(`Connection ${JSON.stringify(connObj)}: output port does not exist.`);
        continue;
      }
      const inPort = inNode.inPorts.find((port) => port.name === connObj.inPort);
      if (!outPort) {
        warnings.push(`Connection ${JSON.stringify(connObj)}: input port does not exist.`);
        continue;
      }
      this.connections.push(connObj);
    }

    if (warnings.length) {
      console.warn(warnings);
    }
    return warnings;
  }

  serialize() {
    const json = {
      version: 1,
      nodes: [],
      connections: [],
    };
    for (const node of this.nodes) {
      const values = {};
      for (const port of node.inPorts) {
        if (port.type === PORT_TYPE_IMAGE) continue;
        if (this.isConnected(port)) continue;
        if (JSON.stringify(port.value) !== JSON.stringify(port.defaultValue)) {
          let value;
          if (port.type === PORT_TYPE_TOGGLE) {
            value = port.value;
          } else if (port.type === PORT_TYPE_NUMBER) {
            value = port.value;
          } else if (port.type === PORT_TYPE_STRING) {
            value = port.value;
          } else if (port.type === PORT_TYPE_SELECT) {
            value = port.value;
          } else if (port.type === PORT_TYPE_POINT) {
            value = [port.value.x, port.value.y];
          } else if (port.type === PORT_TYPE_COLOR) {
            value = port.value.slice();
          } else if (port.type === PORT_TYPE_FILE) {
            value = port.value;
          }
          values[port.name] = value;
        }
      }
      const nodeObj = { id: node.id, name: node.name, type: node.type, x: node.x, y: node.y };
      if (Object.keys(values).length > 0) {
        nodeObj.values = values;
      }
      json.nodes.push(nodeObj);
    }
    json.connections = JSON.parse(JSON.stringify(this.connections));
    json.types = JSON.parse(JSON.stringify(this.types));
    return json;
  }

  isConnected(port) {
    if (port.direction === PORT_IN) {
      return !!this.connections.find((conn) => conn.inNode === port.node.id && conn.inPort === port.name);
    } else {
      return !!this.connections.find((conn) => conn.inNode === port.node.id && conn.inPort === port.name);
    }
  }

  start() {
    for (const node of this.nodes) {
      this._startNode(node);
    }
    this.started = true;
  }

  _startNode(node) {
    if (node.onStart) {
      try {
        node.onStart(node);
      } catch (e) {
        console.error(e && e.stack);
      }
    }
    // Force set all ports
    try {
      for (const port of node.inPorts) {
        port.forceUpdate();
      }
      for (const port of node.outPorts) {
        port.forceUpdate();
      }
    } catch (e) {
      console.error(e && e.stack);
    }
  }

  stop() {
    for (const node of this.nodes) {
      this._stopNode(node);
    }
    this.started = false;
  }

  _stopNode(node) {
    if (node.onStop) {
      try {
        node.onStop(node);
      } catch (e) {
        console.error(e && e.stack);
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
    const nodes = this.nodes.filter((n) => n.type === nodeType.type);
    nodeType.source = source;
    const description = source.match(/\/\/(.*)/);
    if (description) {
      nodeType.description = description[1].trim();
    } else {
      nodeType.description = '';
    }
    for (const node of nodes) {
      this.changeNodeType(node, nodeType);
    }
    this.doFrame();
  }

  setPortValue(node, portName, value) {
    const port = node.inPorts.find((p) => p.name === portName);
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

  connect(outPort, inPort) {
    const outNode = outPort.node;
    const inNode = inPort.node;
    // Remove existing connections.
    this.disconnect(inPort);
    const conn = {
      outNode: outNode.id,
      outPort: outPort.name,
      inNode: inNode.id,
      inPort: inPort.name,
    };
    this.connections.push(conn);
    outPort.forceUpdate();
    this.doFrame();
  }

  disconnect(inPort) {
    const inNode = inPort.node;
    this.connections = this.connections.filter((conn) => !(conn.inNode === inNode.id && conn.inPort === inPort.name));
    inPort.setDefaultValue();
    this.doFrame();
  }

  deleteNodes(nodes) {
    const nodeIds = nodes.map((node) => node.id);
    for (const node of nodes) {
      this._stopNode(node);
    }
    this.nodes = this.nodes.filter((node) => !nodes.includes(node));
    this.connections = this.connections.filter(
      (conn) => !(nodeIds.includes(conn.inNode) || nodeIds.includes(conn.outNode))
    );
    this.doFrame();
  }

  forkNodeType(nodeType, newName, newTypeName) {
    const [ns, baseName] = newTypeName.split('.');
    if (ns !== 'project') {
      throw new Error(`forkNodeType ${newTypeName}: currently only project-level types are supported.`);
    }
    // Check if a type with this name already exists.
    this.types = this.types || [];
    if (this.types.find((nodeType) => nodeType.type == newTypeName)) {
      throw new Error(`A nodeType with the name ${newTypeName} already exists.`);
    }
    const newNodeType = {
      name: newName,
      type: newTypeName,
      source: nodeType.source,
    };
    this.types.push(newNodeType);
    return newNodeType;
  }

  changeNodeType(node, nodeType) {
    console.assert(typeof nodeType === 'object');
    // Stop the node and remove it from the network.
    this._stopNode(node);
    this.nodes = this.nodes.filter((n) => n !== node);
    // Create a new node with the new type.
    const newNode = this.createNode(nodeType.type, node.x, node.y, { id: node.id });
    // Copy over parameters.
    for (const oldPort of node.inPorts) {
      if (oldPort.hasDefaultValue()) continue;
      const newPort = newNode.inPorts.find((p) => p.name === oldPort.name);
      if (!newPort) continue;
      if (newPort.type !== oldPort.type) continue;
      newPort.value = oldPort.cloneValue();
    }
  }

  renameNode(node, newName) {
    node.name = newName;
  }
}
