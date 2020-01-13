import Port, { PORT_TYPE_TRIGGER, PORT_TYPE_FLOAT, PORT_TYPE_POINT, PORT_TYPE_COLOR } from './Port';

let gNodeId = 0;

export default class Node {
  constructor(network, id, name, type, x, y) {
    this.__id = ++gNodeId;
    this.network = network;
    this.id = id;
    this.name = name;
    this.type = type;
    this.x = x;
    this.y = y;
    this.inPorts = [];
    this.outPorts = [];
  }

  triggerIn(name) {
    const oldPort = this.inPorts.find(p => p.name === name);
    if (oldPort) return oldPort;
    const inPort = new Port(this, name, PORT_TYPE_TRIGGER);
    this.inPorts.push(inPort);
    return inPort;
  }

  floatIn(name, value) {
    const oldPort = this.inPorts.find(p => p.name === name);
    if (oldPort) {
      if (oldPort.hasDefaultValue()) {
        oldPort.value = value;
        oldPort.defaultValue = value;
      }
      return oldPort;
    } else {
      const inPort = new Port(this, name, PORT_TYPE_FLOAT, value);
      this.inPorts.push(inPort);
      return inPort;
    }
  }

  pointIn(name, value) {
    const oldPort = this.inPorts.find(p => p.name === name);
    if (oldPort) {
      if (oldPort.hasDefaultValue()) {
        oldPort.value = value;
        oldPort.defaultValue = value;
      }
      return oldPort;
    } else {
      const inPort = new Port(this, name, PORT_TYPE_POINT, value && value.clone());
      this.inPorts.push(inPort);
      return inPort;
    }
  }

  colorIn(name, value) {
    const oldPort = this.inPorts.find(p => p.name === name);
    if (oldPort) {
      if (oldPort.hasDefaultValue()) {
        oldPort.value = value;
        oldPort.defaultValue = value;
      }
      return oldPort;
    } else {
      const inPort = new Port(this, name, PORT_TYPE_COLOR, value);
      this.inPorts.push(inPort);
      return inPort;
    }
  }

  triggerOut(name) {
    const oldPort = this.outPorts.find(p => p.name === name);
    if (oldPort) return oldPort;
    const outPort = new Port(this, name, PORT_TYPE_TRIGGER);
    this.outPorts.push(outPort);
    return outPort;
  }

  _triggerOut(outPort, props) {
    // Find if this node is connected.
    const connections = this.network.connections.filter(conn => conn.outNode === this.id);
    for (const conn of connections) {
      const inNode = this.network.nodes.find(node => node.id === conn.inNode);
      const inPort = inNode.inPorts.find(port => port.name === conn.inPort);
      inPort && inPort.onTrigger && inPort.onTrigger(props);
    }
  }
}
