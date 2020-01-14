import { COLORS } from '../colors';

export const PORT_TYPE_TRIGGER = 'trigger';
export const PORT_TYPE_NUMBER = 'float';
export const PORT_TYPE_COLOR = 'color';
export const PORT_TYPE_POINT = 'point';

export const PORT_IN = 'in';
export const PORT_OUT = 'out';

let gPortId = 0;

export default class Port {
  constructor(node, name, type, direction, value) {
    this.__id = ++gPortId;
    this.node = node;
    this.name = name;
    this.type = type;
    this.direction = direction;
    this.value = value;
    this.defaultValue = value;
  }

  hasDefaultValue() {
    return JSON.stringify(this.defaultValue) === JSON.stringify(this.value);
  }

  trigger(props) {
    this.node._triggerOut(this, props);
  }

  set(value) {
    this.value = value;
    this.node._valueOut(this, value);
  }
}
