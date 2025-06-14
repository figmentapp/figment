import { LATEST_FORMAT_VERSION } from '../file-format';
import Node from './Node';
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
  PORT_TYPE_DIRECTORY,
  PORT_TYPE_IMAGE,
  PORT_TYPE_BOOLEAN,
  PORT_IN,
  PORT_OUT,
} from './Port';
import DependencyGraph from './DependencyGraph';
import { setExpressionContext } from '../expr';

export const getDefaultNetwork = () => ({
  nodes: [
    {
      id: 1,
      name: 'Load Movie',
      type: 'image.loadMovie',
      x: 100,
      y: 50,
      values: {
        file: { type: 'value', value: window.desktop.getPackagedFile('examples/assets/waves.mp4') },
      },
    },
    {
      id: 2,
      name: 'Resize',
      type: 'image.resize',
      x: 100,
      y: 150,
    },
    {
      id: 3,
      name: 'Sobel',
      type: 'image.sobel',
      x: 250,
      y: 250,
    },
    {
      id: 4,
      name: 'Threshold',
      type: 'image.threshold',
      x: 250,
      y: 350,
      values: {
        threshold: { type: 'value', value: 0.3 },
      },
    },
    {
      id: 5,
      name: 'Stack',
      type: 'image.stack',
      x: 100,
      y: 450,
    },
    {
      id: 6,
      name: 'Out',
      type: 'core.out',
      x: 100,
      y: 550,
    },
  ],
  connections: [
    { outNode: 1, outPort: 'out', inNode: 2, inPort: 'in' },
    { outNode: 2, outPort: 'out', inNode: 3, inPort: 'in' },
    { outNode: 3, outPort: 'out', inNode: 4, inPort: 'in' },
    { outNode: 2, outPort: 'out', inNode: 5, inPort: 'image 1' },
    { outNode: 4, outPort: 'out', inNode: 5, inPort: 'image 2' },
    { outNode: 5, outPort: 'out', inNode: 6, inPort: 'in' },
  ],
  settings: {
    oscEnabled: false,
    oscPort: 8000,
  },
});

export default class Network {
  constructor(library) {
    this.started = false;
    this.startTime = 0;
    this.frame = 0;
    this.library = library;
    this.nodes = [];
    this.connections = [];
    this.settings = {};
    this.types = [];
    this._id = 0;
    this.listeners = [];
    this._dag = new DependencyGraph(this);
  }

  _rebuildDependencyGraph() {
    this._dag.build();
  }

  addChangeListener(listener) {
    this.listeners.push(listener);
  }

  removeChangeListener(listener) {
    this.listeners = this.listeners.filter((l) => l !== listener);
  }

  _onChange() {
    for (const listener of this.listeners) {
      listener(this);
    }
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
    console.warn(`Could not find nodeType ${typeId}`);
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
      console.error(`Error creating ${typeId}: ${e && e.stack}`);
    }

    this.nodes.push(node);
    this._rebuildDependencyGraph();
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
          // The value is in the format {type: "value", value: 0.9}
          const value = nodeObj.values[portName];
          const port = node.inPorts.find((p) => p.name === portName);
          if (!port) {
            warnings.push(`Node ${node.name} (${node.id}): Could not find port ${portName}.`);
            continue;
          }
          if (port.type === PORT_TYPE_TOGGLE) {
            port._value = value;
          } else if (port.type === PORT_TYPE_NUMBER) {
            port._value = value;
          } else if (port.type === PORT_TYPE_STRING) {
            port._value = value;
          } else if (port.type === PORT_TYPE_SELECT) {
            port._value = value;
          } else if (port.type === PORT_TYPE_POINT) {
            port._value = new g.Point(value[0], value[1]);
          } else if (port.type === PORT_TYPE_COLOR) {
            port._value = structuredClone(value);
          } else if (port.type === PORT_TYPE_FILE) {
            port._value = value;
          } else if (port.type === PORT_TYPE_DIRECTORY) {
            port._value = value;
          } else {
            warnings.push(`Node ${node.name} (${node.id}) - port ${portName}: unsupported port type ${port.type} ${value}.`);
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
    for (const key in obj.settings) {
      this.settings[key] = obj.settings[key];
    }

    this._rebuildDependencyGraph();

    if (warnings.length) {
      console.warn(warnings);
    }
    return warnings;
  }

  serialize() {
    const json = {
      version: LATEST_FORMAT_VERSION,
      nodes: [],
      connections: [],
      settings: structuredClone(this.settings),
    };
    for (const node of this.nodes) {
      const values = {};
      for (const port of node.inPorts) {
        if (port.type === PORT_TYPE_IMAGE || port.type === PORT_TYPE_BOOLEAN) continue;
        if (this.isConnected(port)) continue;
        if (port._value.type === 'expression') {
          values[port.name] = structuredClone(port._value);
        } else if (JSON.stringify(port.value) !== JSON.stringify(port.defaultValue)) {
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
          } else if (port.type === PORT_TYPE_DIRECTORY) {
            value = port.value;
          }
          values[port.name] = { type: 'value', value };
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

  async start() {
    for (const node of this.nodes) {
      await this._startNode(node);
    }
    this.started = true;
    this.startTime = Date.now();
    this.frame = 1;
  }

  async render() {
    setExpressionContext({ $NOW: Date.now(), $TIME: (Date.now() - this.startTime) / 1000, $FRAME: this.frame });
    for (const node of this._dag.nodeOrder) {
      await this._renderNode(node);
    }
    this.frame++;
  }

  reset() {
    for (const node of this.nodes) {
      if (node.onReset) {
        try {
          node.onReset(node);
        } catch (e) {
          console.error(e && e.stack);
        }
      }
    }
    this.startTime = Date.now();
    this.frame = 1;
  }

  async _startNode(node) {
    if (node.onStart) {
      try {
        await node.onStart(node);
      } catch (err) {
        console.error(err && err.stack);
        debugger;
      }
    }
  }

  async _renderNode(node) {
    if (node.isDirty && node.onRender) {
      // console.log(`render ${node.id} ${node.name}`);
      try {
        await node.onRender();
      } catch (e) {
        console.error(e && e.stack);
      }
      // Set the value of the connected input ports to the output ports of this node.
      for (const conn of this.connections) {
        if (conn.outNode === node.id) {
          // Find the output port.
          const outPort = node.outPorts.find((port) => port.name === conn.outPort);
          if (!outPort) {
            console.warn(`Connection ${JSON.stringify(conn)}: output port does not exist.`);
            continue;
          }
          // Find the input node.
          const inNode = this.nodes.find((n) => n.id === conn.inNode);
          if (!inNode) {
            console.warn(`Connection ${JSON.stringify(conn)}: input node does not exist.`);
            break;
          }
          const inPort = inNode.inPorts.find((port) => port.name === conn.inPort);
          if (!inPort) {
            console.warn(`Connection ${JSON.stringify(conn)}: input connection does not exist.`);
            break;
          }
          inPort.set(outPort.value);
        }
      }
      node.isDirty = false;
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

  async doFrame() {
    for (const node of this.nodes) {
      if (node.timeDependent) {
        this.markNodeDirty(node);
      }
    }
    await this.render();
  }

  setNodeTypeSource(nodeType, source) {
    console.assert(typeof nodeType === 'object');
    // Find all nodes with this source type.
    const nodes = this.nodes.filter((n) => n.type === nodeType.type);
    nodeType.source = source;
    const oldNodeTypeIndex = this.types.findIndex((t) => t.type === nodeType.type);
    this.types[oldNodeTypeIndex] = nodeType;
    const description = source.match(/\/\/(.*)/);
    if (description) {
      nodeType.description = description[1].trim();
    } else {
      nodeType.description = '';
    }
    for (const node of nodes) {
      this.changeNodeType(node, nodeType);
    }
    // this.doFrame();
  }

  setPortValue(node, portName, value) {
    const port = node.inPorts.find((p) => p.name === portName);
    console.assert(port, `Port ${portName} does not exist.`);
    port.value = value;
    if (typeof port.onChange === 'function') {
      port.onChange();
    }
    port.forceUpdate();
  }

  setPortExpression(node, portName, expression) {
    const port = node.inPorts.find((p) => p.name === portName);
    console.assert(port, `Port ${portName} does not exist.`);
    port._value = { type: 'expression', expression };
    if (typeof port.onChange === 'function') {
      port.onChange();
    }
    port.forceUpdate();
  }

  deletePortExpression(node, portName) {
    const port = node.inPorts.find((p) => p.name === portName);
    console.assert(port, `Port ${portName} does not exist.`);
    port._value = { type: 'value', value: port.defaultValue };
    if (typeof port.onChange === 'function') {
      port.onChange();
    }
    port.forceUpdate();
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
    // this.doFrame();
    this._rebuildDependencyGraph();
    this.markNodeDirty(outNode);
  }

  disconnect(inPort) {
    const inNode = inPort.node;
    this.connections = this.connections.filter((conn) => !(conn.inNode === inNode.id && conn.inPort === inPort.name));
    inPort.setDefaultValue();
    this._rebuildDependencyGraph();
    // this.doFrame();
  }

  deleteNodes(nodes) {
    const nodeIds = nodes.map((node) => node.id);
    for (const node of nodes) {
      this._stopNode(node);
    }
    this.nodes = this.nodes.filter((node) => !nodes.includes(node));
    this.connections = this.connections.filter((conn) => !(nodeIds.includes(conn.inNode) || nodeIds.includes(conn.outNode)));
    this._rebuildDependencyGraph();
    // this.doFrame();
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
    this._rebuildDependencyGraph();
    this.markNodeDirty(node);
  }

  renameNode(node, newName) {
    node.name = newName;
  }

  markNodeDirty(node, visited = null) {
    if (visited === null) {
      visited = new Set();
    } else if (visited.has(node)) {
      return;
    }
    node.isDirty = true;
    visited.add(node);
    // Find all output connections of this node and mark them dirty.
    const downstreams = this._dag.downstreamConnections[node.id];
    if (!downstreams) return;
    for (const nodeId of downstreams) {
      const inputNode = this.nodes.find((n) => n.id === nodeId);
      if (!inputNode) {
        console.warn(`Could not find input node ${conn.inNode} for connection ${conn.outNode} -> ${conn.inNode}`);
        continue;
      }
      this.markNodeDirty(inputNode, visited);
    }
  }

  markDownstreamDirty(node) {
    const visited = new Set();
    const downstreams = this._dag.downstreamConnections[node.id];
    if (!downstreams) return;
    for (const nodeId of downstreams) {
      const inputNode = this.nodes.find((n) => n.id === nodeId);
      if (!inputNode) {
        console.warn(`Could not find input node ${conn.inNode} for connection ${conn.outNode} -> ${conn.inNode}`);
        continue;
      }
      this.markNodeDirty(inputNode, visited);
    }
  }

  setSetting(key, value) {
    this.settings[key] = value;
  }
}
