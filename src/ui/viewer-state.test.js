import { describe, expect, test } from 'vitest';
import { shouldRedrawViewer } from './viewer-state';

describe('shouldRedrawViewer', () => {
  test('redraws when the active network changes', () => {
    const prevState = { network: { id: 'a' }, version: 1 };
    const nextState = { network: { id: 'b' }, version: 1 };

    expect(shouldRedrawViewer(nextState, prevState)).toBe(true);
  });

  test('redraws when the render version changes', () => {
    const network = { id: 'a' };
    const prevState = { network, version: 1 };
    const nextState = { network, version: 2 };

    expect(shouldRedrawViewer(nextState, prevState)).toBe(true);
  });

  test('ignores unrelated store changes', () => {
    const network = { id: 'a' };
    const prevState = { network, version: 1, fullscreen: false };
    const nextState = { network, version: 1, fullscreen: true };

    expect(shouldRedrawViewer(nextState, prevState)).toBe(false);
  });
});
