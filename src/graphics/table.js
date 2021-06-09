export const ATTRIBUTE_TYPE_U8 = 'u8';
export const ATTRIBUTE_TYPE_I16 = 'i16';
export const ATTRIBUTE_TYPE_F32 = 'f32';

class Attribute {
  constructor(name, type, initialCapacity = 32) {
    this.name = name;
    this.type = type;
    this._expand(initialCapacity);
  }

  clone(capacity) {
    const newAttribute = new Attribute(this.name, this.type, capacity);
    if (this.type === ATTRIBUTE_TYPE_U8) {
      newAttribute.data = Uint8Array.from(this.data);
    } else if (this.type === ATTRIBUTE_TYPE_I16) {
      newAttribute.data = Int16Array.from(this.data);
    } else if (this.type === ATTRIBUTE_TYPE_F32) {
      newAttribute.data = Float32Array.from(this.data);
    } else {
      throw new Error(`Unknown type ${this.type}`);
    }
    return newAttribute;
  }

  _expand(newCapacity) {
    this.capacity = newCapacity;
    let newData;
    if (this.type === ATTRIBUTE_TYPE_U8) {
      newData = new Uint8Array(this.capacity);
      this.data && newData.set(this.data);
    } else if (this.type === ATTRIBUTE_TYPE_I16) {
      newData = new Int16Array(this.capacity);
      this.data && newData.set(this.data);
    } else if (this.type === ATTRIBUTE_TYPE_F32) {
      newData = new Float32Array(this.capacity);
      this.data && newData.set(this.data);
    } else {
      throw new Error(`Unknown type ${this.type}`);
    }
    this.data = newData;
  }
}

class AttributeTable {
  constructor(initialCapacity) {
    this.table = {};
    this.size = 0;
    this.capacity = initialCapacity;
  }

  clone() {
    const newTable = new AttributeTable(this.capacity);
    for (const key in this.table) {
      newTable.table[key] = this.table[key].clone(this.capacity);
    }
    newTable.size = this.size;
    return newTable;
  }

  addAttributeType(name, type) {
    this.table[name] = new Attribute(name, type, this.capacity);
  }

  hasAttribute(name) {
    return name in this.table;
  }

  ensureCapacity(requiredSize) {
    if (requiredSize > this.capacity) {
      this.capacity *= 2;
      for (const attr in this.table) {
        this.table[attr]._expand(this.capacity);
      }
    }
  }

  increaseCapacity(newCapacity) {
    this.ensureCapacity(this.size + newCapacity);
  }

  append(data) {
    this.increaseCapacity(1);
    for (const key in data) {
      const attribute = this.table[key];
      if (!attribute) {
        throw new Error(`Attribute ${key} not found.`);
      }
      attribute.data[this.size] = data[key];
    }
    this.size++;
  }

  set(index, data) {
    if (index >= this.size) {
      throw new Error(`Set is called with index out of bounds (${index} >= ${this.size})`);
    }
    for (const key in data) {
      const attribute = this.table[key];
      if (!attribute) {
        throw new Error(`Attribute ${key} not found.`);
      }
      attribute.data[index] = data[key];
    }
  }

  getObject(index) {
    if (index >= this.size) {
      throw new Error(`Get is called with index out of bounds (${index} >= ${this.size})`);
    }
    const obj = {};
    for (const key in this.table) {
      obj[key] = this.table[key].data[index];
    }
    return obj;
  }

  get(index, key) {
    if (index >= this.size) {
      throw new Error(`Get is called with index out of bounds (${index} >= ${this.size})`);
    }
    const attribute = this.table[key];
    if (!attribute) {
      throw new Error(`Attribute ${key} not found.`);
    }
    return attribute.data[index];
  }

  getArray(key) {
    const attribute = this.table[key];
    if (!attribute) {
      throw new Error(`Attribute ${key} not found.`);
    }
    return attribute.data;
  }
}
