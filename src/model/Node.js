import Port, {
  PORT_TYPE_TRIGGER,
  PORT_TYPE_BUTTON,
  PORT_TYPE_TOGGLE,
  PORT_TYPE_NUMBER,
  PORT_TYPE_STRING,
  PORT_TYPE_SELECT,
  PORT_TYPE_POINT,
  PORT_TYPE_COLOR,
  PORT_TYPE_FILE,
  PORT_TYPE_DIRECTORY,
  PORT_TYPE_IMAGE,
  PORT_TYPE_OBJECT,
  PORT_IN,
  PORT_OUT,
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
    const oldPort = this.inPorts.find((p) => p.name === name);
    if (oldPort) return oldPort;
    const inPort = new Port(this, name, PORT_TYPE_TRIGGER, PORT_IN);
    this.inPorts.push(inPort);
    return inPort;
  }

  triggerButtonIn(name) {
    const oldPort = this.inPorts.find((p) => p.name === name);
    if (oldPort) return oldPort;
    const inPort = new Port(this, name, PORT_TYPE_BUTTON, PORT_IN);
    this.inPorts.push(inPort);
    return inPort;
  }

  toggleIn(name, value = true) {
    const oldPort = this.inPorts.find((p) => p.name === name);
    if (oldPort) {
      if (oldPort.hasDefaultValue()) {
        oldPort.value = value;
        oldPort.defaultValue = value;
      }
      return oldPort;
    } else {
      const inPort = new Port(this, name, PORT_TYPE_TOGGLE, PORT_IN, value);
      this.inPorts.push(inPort);
      return inPort;
    }
  }

  numberIn(name, value, options) {
    if (!value) value = 0;
    const oldPort = this.inPorts.find((p) => p.name === name);
    if (oldPort) {
      if (oldPort.hasDefaultValue()) {
        oldPort.value = value;
        oldPort.defaultValue = value;
      }
      return oldPort;
    } else {
      const inPort = new Port(this, name, PORT_TYPE_NUMBER, PORT_IN, value, options);
      this.inPorts.push(inPort);
      return inPort;
    }
  }

  stringIn(name, value) {
    if (!value) value = '';
    const oldPort = this.inPorts.find((p) => p.name === name);
    if (oldPort) {
      if (oldPort.hasDefaultValue()) {
        oldPort.value = value;
        oldPort.defaultValue = value;
      }
      return oldPort;
    } else {
      const inPort = new Port(this, name, PORT_TYPE_STRING, PORT_IN, value);
      this.inPorts.push(inPort);
      return inPort;
    }
  }

  pointIn(name, value) {
    if (!value) value = new g.Point(0, 0);
    const oldPort = this.inPorts.find((p) => p.name === name);
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
    const oldPort = this.inPorts.find((p) => p.name === name);
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

  fileIn(name, value) {
    if (!value) value = '';
    const oldPort = this.inPorts.find((p) => p.name === name);
    if (oldPort) {
      if (oldPort.hasDefaultValue()) {
        oldPort.value = value;
        oldPort.defaultValue = value;
      }
      return oldPort;
    } else {
      const inPort = new Port(this, name, PORT_TYPE_FILE, PORT_IN, value);
      this.inPorts.push(inPort);
      return inPort;
    }
  }

  directoryIn(name, value) {
    if (!value) value = '';
    const oldPort = this.inPorts.find((p) => p.name === name);
    if (oldPort) {
      if (oldPort.hasDefaultValue()) {
        oldPort.value = value;
        oldPort.defaultValue = value;
      }
      return oldPort;
    } else {
      const inPort = new Port(this, name, PORT_TYPE_DIRECTORY, PORT_IN, value);
      this.inPorts.push(inPort);
      return inPort;
    }
  }

  imageIn(name) {
    const oldPort = this.inPorts.find((p) => p.name === name);
    if (oldPort) {
      return oldPort;
    } else {
      const inPort = new Port(this, name, PORT_TYPE_IMAGE, PORT_IN);
      this.inPorts.push(inPort);
      return inPort;
    }
  }

  objectIn(name) {
    const oldPort = this.inPorts.find((p) => p.name === name);
    if (oldPort) {
      return oldPort;
    } else {
      const inPort = new Port(this, name, PORT_TYPE_OBJECT, PORT_IN);
      this.inPorts.push(inPort);
      return inPort;
    }
  }

  selectIn(name, options, value) {
    if (!value) value = options[0];
    const oldPort = this.inPorts.find((p) => p.name === name);
    if (oldPort) {
      if (oldPort.hasDefaultValue()) {
        oldPort.value = value;
        oldPort.defaultValue = value;
      }
      oldPort.options = options;
      return oldPort;
    } else {
      const inPort = new Port(this, name, PORT_TYPE_SELECT, PORT_IN, value);
      inPort.options = options;
      this.inPorts.push(inPort);
      return inPort;
    }
  }

  triggerOut(name) {
    const oldPort = this.outPorts.find((p) => p.name === name);
    if (oldPort) return oldPort;
    const outPort = new Port(this, name, PORT_TYPE_TRIGGER, PORT_OUT);
    this.outPorts.push(outPort);
    return outPort;
  }

  toggleOut(name, value) {
    if (!value) value = false;
    const oldPort = this.outPorts.find((p) => p.name === name);
    if (oldPort) return oldPort;
    const outPort = new Port(this, name, PORT_TYPE_TOGGLE, PORT_OUT, value);
    this.outPorts.push(outPort);
    return outPort;
  }

  numberOut(name, value) {
    if (!value) value = 0;
    const oldPort = this.outPorts.find((p) => p.name === name);
    if (oldPort) return oldPort;
    const outPort = new Port(this, name, PORT_TYPE_NUMBER, PORT_OUT, value);
    this.outPorts.push(outPort);
    return outPort;
  }

  stringOut(name, value) {
    if (!value) value = 0;
    const oldPort = this.outPorts.find((p) => p.name === name);
    if (oldPort) return oldPort;
    const outPort = new Port(this, name, PORT_TYPE_STRING, PORT_OUT, value);
    this.outPorts.push(outPort);
    return outPort;
  }

  colorOut(name, value) {
    if (!value) value = [0, 0, 0, 0];
    const oldPort = this.outPorts.find((p) => p.name === name);
    if (oldPort) return oldPort;
    const outPort = new Port(this, name, PORT_TYPE_COLOR, PORT_OUT, value);
    this.outPorts.push(outPort);
    return outPort;
  }

  imageOut(name) {
    const oldPort = this.outPorts.find((p) => p.name === name);
    if (oldPort) return oldPort;
    const outPort = new Port(this, name, PORT_TYPE_IMAGE, PORT_OUT);
    this.outPorts.push(outPort);
    return outPort;
  }

  objectOut(name) {
    const oldPort = this.outPorts.find((p) => p.name === name);
    if (oldPort) return oldPort;
    const outPort = new Port(this, name, PORT_TYPE_OBJECT, PORT_OUT);
    this.outPorts.push(outPort);
    return outPort;
  }
}
