import { core, graphics } from './sources';

export default class Library {
  constructor() {
    this.nodeTypes = [];
    this.nodeTypes.push({
      name: 'Sequence',
      type: 'core.sequence',
      source: core.sequence
    });
    this.nodeTypes.push({
      name: 'Custom',
      type: 'core.custom',
      source: core.custom
    });
    this.nodeTypes.push({ name: 'Canvas', type: 'graphics.canvas', source: graphics.canvas });
    this.nodeTypes.push({
      name: 'Background Color',
      type: 'graphics.backgroundColor',
      source: graphics.backgroundColor
    });
    this.nodeTypes.push({ name: 'Rectangle', type: 'graphics.rect', source: graphics.rect });
    this.nodeTypes.push({ name: 'Clone', type: 'graphics.clone', source: graphics.clone });
    for (const nodeType of this.nodeTypes) {
      const description = nodeType.source.match(/\/\/(.*)/);
      if (description) {
        nodeType.description = description[1].trim();
      } else {
        nodeType.description = '';
      }
    }
  }

  findByType(type) {
    return this.nodeTypes.find(node => node.type === type);
  }
}
