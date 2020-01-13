import * as sources from './sources';

export default class Library {
  constructor() {
    this.nodeTypes = [];
    this.nodeTypes.push({
      name: 'Sequence',
      type: 'core.sequence',
      source: sources.sourceSequence
    });

    this.nodeTypes.push({ name: 'Canvas', type: 'graphics.canvas', source: sources.sourceCanvas });
    this.nodeTypes.push({
      name: 'Background Color',
      type: 'graphics.backgroundColor',
      source: sources.sourceBackgroundColor
    });
    this.nodeTypes.push({ name: 'Rect', type: 'graphics.rect', source: sources.sourceRect });
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
