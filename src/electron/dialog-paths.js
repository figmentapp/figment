import path from 'path';

// The folder each file dialog opens in. A dialog starts next to the current
// project, or in the fallback folder when no project is saved. Once the user
// picks a file, dialogs of that kind reopen in the chosen folder until the
// project changes. Nothing here is persisted.
export class DialogFolders {
  constructor(fallbackDirectory) {
    this._fallback = fallbackDirectory;
    this._projectFilePath = null;
    this._chosen = new Map();
  }

  setProject(projectFilePath) {
    const next = projectFilePath || null;
    if (next === this._projectFilePath) return;
    this._projectFilePath = next;
    this._chosen.clear();
  }

  remember(kind, filePath) {
    this._chosen.set(kind, path.dirname(filePath));
  }

  defaultFor(kind) {
    if (this._chosen.has(kind)) return this._chosen.get(kind);
    if (this._projectFilePath) return path.dirname(this._projectFilePath);
    return this._fallback;
  }
}
