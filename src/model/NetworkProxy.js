import {
  PORT_IN,
  PORT_OUT,
  PORT_TYPE_IMAGE,
  PORT_TYPE_BOOLEAN,
  PORT_TYPE_TRIGGER,
  PORT_TYPE_POINT,
  PORT_TYPE_COLOR,
  PORT_TYPE_TOGGLE,
  PORT_TYPE_NUMBER,
  PORT_TYPE_STRING,
  PORT_TYPE_SELECT,
  PORT_TYPE_FILE,
  PORT_TYPE_DIRECTORY,
} from './Port';

function cloneValueForSerialization(portType, value) {
  if (value === undefined || value === null) {
    return value;
  }
  if (portType === PORT_TYPE_COLOR) {
    return Array.isArray(value) ? value.slice() : structuredClone(value);
  }
  if (portType === PORT_TYPE_POINT) {
    if (Array.isArray(value)) {
      return value.slice();
    }
    if (typeof value === 'object' && value !== null) {
      if (typeof value.x === 'number' || typeof value.y === 'number') {
        return [value.x ?? 0, value.y ?? 0];
      }
      if ('0' in value && '1' in value) {
        return [value[0], value[1]];
      }
    }
  }
  if (typeof value === 'object') {
    return structuredClone(value);
  }
  return value;
}

function normalizePort(port, node) {
  port.node = node;
  port.nodeId = node.id;
  if (port.direction !== PORT_IN && port.direction !== PORT_OUT) {
    port.direction = port.direction === 'out' ? PORT_OUT : PORT_IN;
  }
  if (!port._value) {
    port._value = { type: 'value', value: port.value };
  }
  if (port._value.type === 'value') {
    port.value = cloneValueForSerialization(port.type, port._value.value);
  }
  return port;
}

export default class NetworkProxy {
  constructor(schema, { nodeTypes = [] } = {}) {
    this.listeners = new Set();
    this.nodeTypes = nodeTypes;
    this.updateFromSchema(schema, { suppressEvent: true });
  }

  updateFromSchema(schema, { suppressEvent = false } = {}) {
    this._schema = structuredClone(schema ?? {});
    this.nodes = this._schema.nodes || [];
    this.connections = this._schema.connections || [];
    this.settings = this._schema.settings || {};
    this.types = this._schema.types || [];

    this.nodesById = new Map();
    this.portByKey = new Map();

    for (const node of this.nodes) {
      node.inPorts = (node.inPorts || []).map((port) => normalizePort(port, node));
      node.outPorts = (node.outPorts || []).map((port) => normalizePort(port, node));
      this.nodesById.set(node.id, node);
      for (const port of node.inPorts) {
        this.portByKey.set(`${node.id}:in:${port.name}`, port);
      }
      for (const port of node.outPorts) {
        this.portByKey.set(`${node.id}:out:${port.name}`, port);
      }
    }

    if (!suppressEvent) {
      this._emitChange();
    }
  }

  addChangeListener(listener) {
    this.listeners.add(listener);
  }

  removeChangeListener(listener) {
    this.listeners.delete(listener);
  }

  _emitChange() {
    for (const listener of this.listeners) {
      listener(this);
    }
  }

  toSchema() {
    return structuredClone(this._schema);
  }

  findNodeType(typeId) {
    const type = this.types.find((t) => t.type === typeId);
    if (type) return type;
    return this.nodeTypes.find((t) => t.type === typeId);
  }

  getNodeById(id) {
    return this.nodesById.get(id);
  }

  isConnected(port) {
    if (!port || !port.nodeId) return false;
    if (port.direction === PORT_IN) {
      return this.connections.some((conn) => conn.inNode === port.nodeId && conn.inPort === port.name);
    }
    return this.connections.some((conn) => conn.outNode === port.nodeId && conn.outPort === port.name);
  }

  setPortValue(nodeOrId, portName, value) {
    const node = this._resolveNode(nodeOrId);
    if (!node) return;
    const port = node.inPorts.find((p) => p.name === portName);
    if (!port) return;
    port._value = { type: 'value', value: structuredClone(value) };
    port.value = cloneValueForSerialization(port.type, value);
    port.error = null;
    this._emitChange();
  }

  setPortExpression(nodeOrId, portName, expression) {
    const node = this._resolveNode(nodeOrId);
    if (!node) return;
    const port = node.inPorts.find((p) => p.name === portName);
    if (!port) return;
    port._value = { type: 'expression', expression };
    port.error = null;
    this._emitChange();
  }

  deletePortExpression(nodeOrId, portName) {
    const node = this._resolveNode(nodeOrId);
    if (!node) return;
    const port = node.inPorts.find((p) => p.name === portName);
    if (!port) return;
    port._value = { type: 'value', value: cloneValueForSerialization(port.type, port.defaultValue) };
    port.value = cloneValueForSerialization(port.type, port.defaultValue);
    port.error = null;
    this._emitChange();
  }

  serialize() {
    const json = {
      version: this._schema.version,
      nodes: [],
      connections: structuredClone(this.connections),
      settings: structuredClone(this.settings),
      types: structuredClone(this.types),
    };

    for (const node of this.nodes) {
      const nodeObj = {
        id: node.id,
        name: node.name,
        type: node.type,
        x: node.x,
        y: node.y,
      };
      const values = {};
      for (const port of node.inPorts) {
        if (port.type === PORT_TYPE_IMAGE || port.type === PORT_TYPE_BOOLEAN) continue;
        if (this.isConnected(port)) continue;
        if (port._value?.type === 'expression') {
          values[port.name] = structuredClone(port._value);
        } else {
          const serializedValue = cloneValueForSerialization(port.type, port.value);
          const serializedDefault = cloneValueForSerialization(port.type, port.defaultValue);
          if (JSON.stringify(serializedValue) !== JSON.stringify(serializedDefault)) {
            values[port.name] = { type: 'value', value: serializedValue };
          }
        }
      }
      if (Object.keys(values).length > 0) {
        nodeObj.values = values;
      }
      json.nodes.push(nodeObj);
    }

    return json;
  }

  _resolveNode(nodeOrId) {
    if (!nodeOrId) return undefined;
    if (typeof nodeOrId === 'number') {
      return this.getNodeById(nodeOrId);
    }
    if (this.nodesById.has(nodeOrId.id)) {
      return this.nodesById.get(nodeOrId.id);
    }
    return undefined;
  }
}
