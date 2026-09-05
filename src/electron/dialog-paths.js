import path from 'path';

// The folder a file dialog opens in: next to the current project, or the fallback when no project is saved.
export function defaultDialogDirectory(projectFilePath, fallbackDirectory) {
  if (!projectFilePath) return fallbackDirectory;
  return path.dirname(projectFilePath);
}
