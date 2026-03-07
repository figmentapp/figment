import { describe, expect, test } from 'vitest';
import { upgradeProject } from './file-format';

describe('upgradeProject', () => {
  test('removes connections to deleted TF.js nodes during the WebGPU migration', () => {
    const upgraded = upgradeProject({
      version: 5,
      nodes: [
        { id: 1, type: 'image.loadImage' },
        { id: 2, type: 'ml.detectObjects' },
        { id: 3, type: 'ml.imageToImageModel' },
        { id: 4, type: 'core.out' },
      ],
      connections: [
        { outNode: 1, outPort: 'out', inNode: 2, inPort: 'in' },
        { outNode: 2, outPort: 'out', inNode: 4, inPort: 'in' },
        { outNode: 1, outPort: 'out', inNode: 3, inPort: 'in' },
        { outNode: 1, outPort: 'out', inNode: 4, inPort: 'in' },
      ],
      settings: {},
    });

    expect(upgraded.version).toBe(6);
    expect(upgraded.nodes.map((node) => node.id)).toEqual([1, 4]);
    expect(upgraded.connections).toEqual([{ outNode: 1, outPort: 'out', inNode: 4, inPort: 'in' }]);
  });
});
