import { describe, expect, test } from 'vitest';
import Port, { PORT_TYPE_BOOLEAN, PORT_IN } from './Port.js';

const mockNode = {
  _markDirty: () => {},
  network: { markNodeDirty: () => {}, markDownstreamDirty: () => {}, _onChange: () => {} },
};

describe('Port setDefaultValue', () => {
  test('restores boolean port to its default value', () => {
    const port = new Port(mockNode, 'enable', PORT_TYPE_BOOLEAN, PORT_IN, true);
    port.value = false; // simulate connected port sending false
    port.setDefaultValue(); // simulate disconnection
    expect(port.value).toBe(true);
  });

  test('restores false-default boolean port correctly', () => {
    const port = new Port(mockNode, 'inverted', PORT_TYPE_BOOLEAN, PORT_IN, false);
    port.value = true;
    port.setDefaultValue();
    expect(port.value).toBe(false);
  });
});
