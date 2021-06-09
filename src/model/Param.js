export const PARAM_TYPE_INT = 'int';
export const PARAM_TYPE_INT2 = 'int2';
export const PARAM_TYPE_FLOAT = 'float';
export const PARAM_TYPE_FLOAT2 = 'float2';
export const PARAM_TYPE_COLOR = 'color';
export const PARAM_TYPE_STRING = 'string';

// export const PORT_TYPE_TOGGLE = 'toggle';
// export const PORT_TYPE_NUMBER = 'number';
// export const PORT_TYPE_SELECT = 'select';
// export const PORT_TYPE_COLOR = 'color';
// export const PORT_TYPE_POINT = 'point';
// export const PORT_TYPE_FILE = 'file';
// export const PORT_TYPE_IMAGE = 'image';
// export const PORT_TYPE_OBJECT = 'object';

let gParamId = 0;

export default class Param {
  constructor(node, name, type, value, options) {
    this.__id = ++gParamId;
    this.node = node;
    this.name = name;
    this.type = type;
    this.value = value;
    this.defaultValue = value;
    options = options || {};
    this.min = options.min !== undefined ? options.min : undefined;
    this.max = options.max !== undefined ? options.max : undefined;
    this.step = options.step || 1;
  }

  hasDefaultValue() {
    return JSON.stringify(this.defaultValue) === JSON.stringify(this.value);
  }

  // trigger(props) {
  //   // Find if this port is connected.
  //   const network = this.node.network;
  //   const connections = network.connections.filter(conn => conn.outNode === this.node.id && conn.outPort === this.name);
  //   for (const conn of connections) {
  //     const inNode = network.nodes.find(node => node.id === conn.inNode);
  //     const inPort = inNode.inPorts.find(port => port.name === conn.inPort);
  //     inPort && inPort.onTrigger && inPort.onTrigger(props);
  //   }
  // }

  set(value) {
    this.value = value;
    this.forceUpdate();
  }

  forceUpdate() {
    if (this.direction === PORT_IN) {
      this.onChange && this.onChange(this.value);
    } else {
      const network = this.node.network;
      const connections = network.connections.filter(
        conn => conn.outNode === this.node.id && conn.outPort === this.name
      );
      for (const conn of connections) {
        const inNode = network.nodes.find(node => node.id === conn.inNode);
        const inPort = inNode.inPorts.find(port => port.name === conn.inPort);
        if (inPort) {
          inPort.value = this.value;
          inPort.onChange && inPort.onChange(this.value);
        }
      }
    }
  }

  setDefaultValue() {
    this.value = JSON.parse(JSON.stringify(this.defaultValue));
  }

  cloneValue() {
    return JSON.parse(JSON.stringify(this.value));
  }
}
