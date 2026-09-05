import { describe, expect, test } from 'vitest';
import { defaultDialogDirectory } from './dialog-paths.js';

describe('defaultDialogDirectory', () => {
  test('uses the folder of the current project', () => {
    expect(defaultDialogDirectory('/work/demo/scene.fgmt', '/home/me/Desktop')).toBe('/work/demo');
  });

  test('falls back to the given folder when there is no project', () => {
    expect(defaultDialogDirectory(undefined, '/home/me/Desktop')).toBe('/home/me/Desktop');
    expect(defaultDialogDirectory('', '/home/me/Desktop')).toBe('/home/me/Desktop');
  });
});
