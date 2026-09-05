import { describe, expect, test } from 'vitest';
import { DialogFolders } from './dialog-paths.js';

const desktop = '/home/me/Desktop';

describe('DialogFolders', () => {
  test('starts on the desktop when there is no project', () => {
    const folders = new DialogFolders(desktop);
    expect(folders.defaultFor('image')).toBe(desktop);
  });

  test('starts in the folder of the current project', () => {
    const folders = new DialogFolders(desktop);
    folders.setProject('/work/demo/scene.fgmt');
    expect(folders.defaultFor('image')).toBe('/work/demo');
  });

  test('remembers the last chosen folder per dialog kind', () => {
    const folders = new DialogFolders(desktop);
    folders.setProject('/work/demo/scene.fgmt');
    folders.remember('image', '/photos/cat.png');
    expect(folders.defaultFor('image')).toBe('/photos');
    expect(folders.defaultFor('directory')).toBe('/work/demo');
  });

  test('forgets chosen folders when the project changes', () => {
    const folders = new DialogFolders(desktop);
    folders.setProject('/work/demo/scene.fgmt');
    folders.remember('image', '/photos/cat.png');
    folders.setProject('/work/other/scene.fgmt');
    expect(folders.defaultFor('image')).toBe('/work/other');
  });

  test('keeps chosen folders when the same project is set again', () => {
    const folders = new DialogFolders(desktop);
    folders.setProject('/work/demo/scene.fgmt');
    folders.remember('image', '/photos/cat.png');
    folders.setProject('/work/demo/scene.fgmt');
    expect(folders.defaultFor('image')).toBe('/photos');
  });

  test('forgets chosen folders when the project is closed', () => {
    const folders = new DialogFolders(desktop);
    folders.setProject('/work/demo/scene.fgmt');
    folders.remember('image', '/photos/cat.png');
    folders.setProject(undefined);
    expect(folders.defaultFor('image')).toBe(desktop);
  });
});
