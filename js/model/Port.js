import { COLORS } from '../colors';

export const PORT_TYPE_TRIGGER = 'trigger';
export const PORT_TYPE_FLOAT = 'float';
export const PORT_TYPE_COLOR = 'color';
export const PORT_TYPE_POINT = 'point';

let gPortId = 0;

export default class Port {
  constructor(node, name, type, value) {
    this.__id = ++gPortId;
    this.node = node;
    this.name = name;
    this.type = type;
    this.value = value;
  }

  trigger(props) {
    this.node._triggerOut(this, props);
  }
}
