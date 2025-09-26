// NetworkReconciler.test.js
import { describe, it, expect } from 'vitest';
import { computeDiff } from './NetworkDiff';

describe('NetworkDiff', () => {
  describe('computeDiff', () => {
    it('should detect nodes to create', () => {
      const current = { nodes: [], connections: [] };
      const desired = {
        nodes: [{ id: 1, type: 'image.resize', x: 100, y: 50, values: {} }],
        connections: [],
      };

      const diff = computeDiff(current, desired);

      expect(diff.nodesToCreate).toHaveLength(1);
      expect(diff.nodesToCreate[0].id).toBe(1);
      expect(diff.nodesToDelete).toHaveLength(0);
      expect(diff.nodesToUpdate).toHaveLength(0);
    });

    it('should detect nodes to delete', () => {
      const current = {
        nodes: [{ id: 1, type: 'image.resize', x: 100, y: 50, values: {} }],
        connections: [],
      };
      const desired = { nodes: [], connections: [] };

      const diff = computeDiff(current, desired);

      expect(diff.nodesToDelete).toHaveLength(1);
      expect(diff.nodesToDelete[0].id).toBe(1);
      expect(diff.nodesToCreate).toHaveLength(0);
    });

    it('should detect position changes', () => {
      const current = {
        nodes: [{ id: 1, type: 'image.resize', x: 100, y: 50, values: {} }],
        connections: [],
      };
      const desired = {
        nodes: [{ id: 1, type: 'image.resize', x: 200, y: 75, values: {} }],
        connections: [],
      };

      const diff = computeDiff(current, desired);

      expect(diff.nodesToUpdate).toHaveLength(1);
      expect(diff.nodesToUpdate[0].id).toBe(1);
      expect(diff.nodesToUpdate[0].changes.position).toEqual({ x: 200, y: 75 });
    });

    it('should detect name changes', () => {
      const current = {
        nodes: [{ id: 1, type: 'image.resize', name: 'Resize', x: 100, y: 50, values: {} }],
        connections: [],
      };
      const desired = {
        nodes: [{ id: 1, type: 'image.resize', name: 'Scale Down', x: 100, y: 50, values: {} }],
        connections: [],
      };

      const diff = computeDiff(current, desired);

      expect(diff.nodesToUpdate).toHaveLength(1);
      expect(diff.nodesToUpdate[0].changes.name).toBe('Scale Down');
    });

    it('should detect value changes from default to set', () => {
      const current = {
        nodes: [{ id: 1, type: 'image.threshold', x: 100, y: 50, values: {} }],
        connections: [],
      };
      const desired = {
        nodes: [
          {
            id: 1,
            type: 'image.threshold',
            x: 100,
            y: 50,
            values: {
              threshold: { type: 'value', value: 0.75 },
            },
          },
        ],
        connections: [],
      };

      const diff = computeDiff(current, desired);

      expect(diff.nodesToUpdate).toHaveLength(1);
      expect(diff.nodesToUpdate[0].changes.changedPorts).toContain('threshold');
      expect(diff.nodesToUpdate[0].changes.values.threshold).toEqual({
        type: 'value',
        value: 0.75,
      });
    });

    it('should detect value changes from set to default', () => {
      const current = {
        nodes: [
          {
            id: 1,
            type: 'image.threshold',
            x: 100,
            y: 50,
            values: {
              threshold: { type: 'value', value: 0.75 },
            },
          },
        ],
        connections: [],
      };
      const desired = {
        nodes: [{ id: 1, type: 'image.threshold', x: 100, y: 50, values: {} }],
        connections: [],
      };

      const diff = computeDiff(current, desired);

      expect(diff.nodesToUpdate).toHaveLength(1);
      expect(diff.nodesToUpdate[0].changes.changedPorts).toContain('threshold');
      expect(diff.nodesToUpdate[0].changes.values.threshold).toBeUndefined();
    });

    it('should detect expression value changes', () => {
      const current = {
        nodes: [
          {
            id: 1,
            type: 'transform.rotate',
            x: 100,
            y: 50,
            values: {
              angle: { type: 'value', value: 45 },
            },
          },
        ],
        connections: [],
      };
      const desired = {
        nodes: [
          {
            id: 1,
            type: 'transform.rotate',
            x: 100,
            y: 50,
            values: {
              angle: { type: 'expression', expression: '$FRAME * 2' },
            },
          },
        ],
        connections: [],
      };

      const diff = computeDiff(current, desired);

      expect(diff.nodesToUpdate).toHaveLength(1);
      expect(diff.nodesToUpdate[0].changes.changedPorts).toContain('angle');
      expect(diff.nodesToUpdate[0].changes.values.angle).toEqual({
        type: 'expression',
        expression: '$FRAME * 2',
      });
    });

    it('should detect multiple value changes in same node', () => {
      const current = {
        nodes: [
          {
            id: 1,
            type: 'image.adjust',
            x: 100,
            y: 50,
            values: {
              brightness: { type: 'value', value: 1.0 },
            },
          },
        ],
        connections: [],
      };
      const desired = {
        nodes: [
          {
            id: 1,
            type: 'image.adjust',
            x: 100,
            y: 50,
            values: {
              brightness: { type: 'value', value: 1.5 },
              contrast: { type: 'value', value: 0.8 },
            },
          },
        ],
        connections: [],
      };

      const diff = computeDiff(current, desired);

      expect(diff.nodesToUpdate).toHaveLength(1);
      expect(diff.nodesToUpdate[0].changes.changedPorts).toHaveLength(2);
      expect(diff.nodesToUpdate[0].changes.changedPorts).toContain('brightness');
      expect(diff.nodesToUpdate[0].changes.changedPorts).toContain('contrast');
    });

    it('should detect source code changes and trigger recompile', () => {
      const current = {
        nodes: [
          {
            id: 1,
            type: 'custom.node',
            source: 'node.numberOut("value", 1);',
            x: 100,
            y: 50,
            values: {},
          },
        ],
        connections: [],
      };
      const desired = {
        nodes: [
          {
            id: 1,
            type: 'custom.node',
            source: 'node.numberOut("value", 2);',
            x: 100,
            y: 50,
            values: {},
          },
        ],
        connections: [],
      };

      const diff = computeDiff(current, desired);

      expect(diff.nodesToRecompile).toHaveLength(1);
      expect(diff.nodesToRecompile[0].id).toBe(1);
      expect(diff.nodesToUpdate).toHaveLength(0);
    });

    it('should recreate node when type changes', () => {
      const current = {
        nodes: [{ id: 1, type: 'image.resize', x: 100, y: 50, values: {} }],
        connections: [],
      };
      const desired = {
        nodes: [{ id: 1, type: 'image.rotate', x: 100, y: 50, values: {} }],
        connections: [],
      };

      const diff = computeDiff(current, desired);

      expect(diff.nodesToDelete).toHaveLength(1);
      expect(diff.nodesToDelete[0].id).toBe(1);
      expect(diff.nodesToCreate).toHaveLength(1);
      expect(diff.nodesToCreate[0].id).toBe(1);
      expect(diff.nodesToCreate[0].type).toBe('image.rotate');
    });

    it('should detect connections to add', () => {
      const current = {
        nodes: [
          { id: 1, type: 'image.load', x: 0, y: 0, values: {} },
          { id: 2, type: 'image.resize', x: 100, y: 0, values: {} },
        ],
        connections: [],
      };
      const desired = {
        nodes: [
          { id: 1, type: 'image.load', x: 0, y: 0, values: {} },
          { id: 2, type: 'image.resize', x: 100, y: 0, values: {} },
        ],
        connections: [{ outNode: 1, outPort: 'out', inNode: 2, inPort: 'in' }],
      };

      const diff = computeDiff(current, desired);

      expect(diff.connectionsToAdd).toHaveLength(1);
      expect(diff.connectionsToAdd[0]).toEqual({
        outNode: 1,
        outPort: 'out',
        inNode: 2,
        inPort: 'in',
      });
    });

    it('should detect connections to remove', () => {
      const current = {
        nodes: [
          { id: 1, type: 'image.load', x: 0, y: 0, values: {} },
          { id: 2, type: 'image.resize', x: 100, y: 0, values: {} },
        ],
        connections: [{ outNode: 1, outPort: 'out', inNode: 2, inPort: 'in' }],
      };
      const desired = {
        nodes: [
          { id: 1, type: 'image.load', x: 0, y: 0, values: {} },
          { id: 2, type: 'image.resize', x: 100, y: 0, values: {} },
        ],
        connections: [],
      };

      const diff = computeDiff(current, desired);

      expect(diff.connectionsToRemove).toHaveLength(1);
      expect(diff.connectionsToRemove[0]).toEqual({
        outNode: 1,
        outPort: 'out',
        inNode: 2,
        inPort: 'in',
      });
    });

    it('should handle complex multi-change scenario', () => {
      const current = {
        nodes: [
          { id: 1, type: 'A', x: 0, y: 0, values: {} },
          { id: 2, type: 'B', x: 100, y: 0, values: { val: { type: 'value', value: 1 } } },
          { id: 3, type: 'C', x: 200, y: 0, values: {} },
        ],
        connections: [{ outNode: 1, outPort: 'out', inNode: 2, inPort: 'in' }],
      };
      const desired = {
        nodes: [
          { id: 1, type: 'A', x: 50, y: 50, values: {} }, // moved
          { id: 2, type: 'B', x: 100, y: 0, values: {} }, // value cleared
          { id: 4, type: 'D', x: 300, y: 0, values: {} }, // new node (3 deleted)
        ],
        connections: [
          { outNode: 2, outPort: 'out', inNode: 4, inPort: 'in' }, // new connection
        ],
      };

      const diff = computeDiff(current, desired);

      expect(diff.nodesToCreate).toHaveLength(1);
      expect(diff.nodesToCreate[0].id).toBe(4);

      expect(diff.nodesToDelete).toHaveLength(1);
      expect(diff.nodesToDelete[0].id).toBe(3);

      expect(diff.nodesToUpdate).toHaveLength(2);
      const node1Update = diff.nodesToUpdate.find((u) => u.id === 1);
      expect(node1Update.changes.position).toEqual({ x: 50, y: 50 });

      const node2Update = diff.nodesToUpdate.find((u) => u.id === 2);
      expect(node2Update.changes.changedPorts).toContain('val');

      expect(diff.connectionsToRemove).toHaveLength(1);
      expect(diff.connectionsToAdd).toHaveLength(1);
    });
  });
});
