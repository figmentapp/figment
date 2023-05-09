import { COLORS } from '../colors';
import { startCase } from 'lodash';

export const PORT_TYPE_TRIGGER = 'trigger';
export const PORT_TYPE_TOGGLE = 'toggle';
export const PORT_TYPE_BUTTON = 'button';
export const PORT_TYPE_NUMBER = 'number';
export const PORT_TYPE_STRING = 'string';
export const PORT_TYPE_SELECT = 'select';
export const PORT_TYPE_COLOR = 'color';
export const PORT_TYPE_POINT = 'point';
export const PORT_TYPE_FILE = 'file';
export const PORT_TYPE_DIRECTORY = 'directory';
export const PORT_TYPE_IMAGE = 'image';
export const PORT_TYPE_OBJECT = 'object';
export const PORT_TYPE_BOOLEAN = 'boolean';

export const PORT_IN = 'in';
export const PORT_OUT = 'out';

export const PORT_DISPLAY_HIDDEN = 0x00;
export const PORT_DISPLAY_PARAMETER = 0x01;
export const PORT_DISPLAY_PLUG = 0x02;

let gPortId = 0;

export default class Port {
  constructor(node, name, type, direction, value, options) {
    this.__id = ++gPortId;
    this.node = node;
    this.name = name;
    this.label = startCase(name);
    this.type = type;
    this.direction = direction;
    this.value = value;
    this.defaultValue = value;
    this.display = type === PORT_TYPE_IMAGE || type === PORT_TYPE_BOOLEAN ? PORT_DISPLAY_PLUG : PORT_DISPLAY_PARAMETER;
    options = options || {};
    this.min = options.min !== undefined ? options.min : undefined;
    this.max = options.max !== undefined ? options.max : undefined;
    this.step = options.step || 1;
    this.fileType = options.fileType || 'generic';
  }

  hasDefaultValue() {
    if (this.type === PORT_TYPE_TRIGGER || this.type === PORT_TYPE_IMAGE || this.type === PORT_TYPE_OBJECT) {
      return true;
    }
    return JSON.stringify(this.defaultValue) === JSON.stringify(this.value);
  }

  trigger(props) {
    // Find if this port is connected.
    const network = this.node.network;
    const connections = network.connections.filter((conn) => conn.outNode === this.node.id && conn.outPort === this.name);
    for (const conn of connections) {
      const inNode = network.nodes.find((node) => node.id === conn.inNode);
      const inPort = inNode.inPorts.find((port) => port.name === conn.inPort);
      inPort && inPort.onTrigger && inPort.onTrigger(props);
    }
  }

  set(value) {
    this.value = value;
    this.forceUpdate();
  }

  forceUpdate() {
    if (this.direction === PORT_IN) {
      this.node._markDirty();
      // this.onChange && this.onChange(this.value);
    } else {
      // Mark all connected nodes dirty.
      this.node.network.markDownstreamDirty(this.node);

      // const connections = network.connections.filter((conn) => conn.outNode === this.node.id && conn.outPort === this.name);
      // for (const conn of connections) {
      //   const inNode = network.nodes.find((node) => node.id === conn.inNode);
      //   const inPort = inNode.inPorts.find((port) => port.name === conn.inPort);
      //   if (inPort) {
      //     inPort.value = this.value;
      //     inPort.onChange && inPort.onChange(this.value);
      //   }
      // }
    }
    this.node.network._onChange();
  }

  setDefaultValue() {
    if (
      this.type === PORT_TYPE_TRIGGER ||
      this.type === PORT_TYPE_IMAGE ||
      this.type === PORT_TYPE_OBJECT ||
      this.type === PORT_TYPE_BOOLEAN
    ) {
      this.value = undefined;
      return;
    }
    this.value = JSON.parse(JSON.stringify(this.defaultValue));
  }

  cloneValue() {
    if (this.type === PORT_TYPE_TRIGGER || this.type === PORT_TYPE_IMAGE) {
      return undefined;
    }
    return JSON.parse(JSON.stringify(this.value));
  }
}
