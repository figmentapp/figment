import Port, {
  PORT_TYPE_TRIGGER,
  PORT_TYPE_BUTTON,
  PORT_TYPE_NUMBER,
  PORT_TYPE_POINT,
  PORT_TYPE_COLOR,
  PORT_IN,
  PORT_OUT
} from './Port';

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
    const inPort = new Port(this, name, PORT_TYPE_TRIGGER, PORT_IN);
    this.inPorts.push(inPort);
    return inPort;
  }

  triggerButtonIn(name) {
    const oldPort = this.inPorts.find(p => p.name === name);
    if (oldPort) return oldPort;
    const inPort = new Port(this, name, PORT_TYPE_BUTTON, PORT_IN);
    this.inPorts.push(inPort);
    return inPort;
  }

  numberIn(name, value) {
    if (!value) value = 0;
    const oldPort = this.inPorts.find(p => p.name === name);
    if (oldPort) {
      if (oldPort.hasDefaultValue()) {
        oldPort.value = value;
        oldPort.defaultValue = value;
      }
      return oldPort;
    } else {
      const inPort = new Port(this, name, PORT_TYPE_NUMBER, PORT_IN, value);
      this.inPorts.push(inPort);
      return inPort;
    }
  }

  pointIn(name, value) {
    if (!value) value = new g.Point(0, 0);
    const oldPort = this.inPorts.find(p => p.name === name);
    if (oldPort) {
      if (oldPort.hasDefaultValue()) {
        oldPort.value = value;
        oldPort.defaultValue = value;
      }
      return oldPort;
    } else {
      const inPort = new Port(this, name, PORT_TYPE_POINT, PORT_IN, value && value.clone());
      this.inPorts.push(inPort);
      return inPort;
    }
  }

  colorIn(name, value) {
    if (!value) value = [0, 0, 0, 1];
    const oldPort = this.inPorts.find(p => p.name === name);
    if (oldPort) {
      if (oldPort.hasDefaultValue()) {
        oldPort.value = value;
        oldPort.defaultValue = value;
      }
      return oldPort;
    } else {
      const inPort = new Port(this, name, PORT_TYPE_COLOR, PORT_IN, value);
      this.inPorts.push(inPort);
      return inPort;
    }
  }

  triggerOut(name) {
    const oldPort = this.outPorts.find(p => p.name === name);
    if (oldPort) return oldPort;
    const outPort = new Port(this, name, PORT_TYPE_TRIGGER, PORT_OUT);
    this.outPorts.push(outPort);
    return outPort;
  }

  numberOut(name, value) {
    if (!value) value = 0;
    const oldPort = this.outPorts.find(p => p.name === name);
    if (oldPort) return oldPort;
    const outPort = new Port(this, name, PORT_TYPE_NUMBER, PORT_OUT, value);
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

  _valueOut(outPort, value) {
    // Find if this node is connected.
    const connections = this.network.connections.filter(
      conn => conn.outNode === this.id && conn.outPort === outPort.name
    );
    for (const conn of connections) {
      const inNode = this.network.nodes.find(node => node.id === conn.inNode);
      const inPort = inNode.inPorts.find(port => port.name === conn.inPort);
      if (inPort) {
        inPort.value = value;
        inPort.onChange && inPort.onChange(value);
      }
    }
  }
}