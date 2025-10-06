import React, { useState, useEffect } from 'react';
import { useAppStore } from './store';

export default function NodeRenameDialog() {
  const nodeToRename = useAppStore((s) => s.nodeToRename);
  const closeNodeRenameDialog = useAppStore((s) => s.closeNodeRenameDialog);
  const renameNode = useAppStore((s) => s.renameNode);

  const [newName, setNewName] = useState('');

  useEffect(() => {
    if (nodeToRename) {
      setNewName(nodeToRename.name);
    }
  }, [nodeToRename]);

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.keyCode === 27) {
        e.preventDefault();
        closeNodeRenameDialog();
      } else if (e.keyCode === 13) {
        e.preventDefault();
        renameNode(nodeToRename, newName);
      }
    };

    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [nodeToRename, newName, closeNodeRenameDialog, renameNode]);

  useEffect(() => {
    document.getElementById('fork-dialog-input')?.select();
  }, []);

  if (!nodeToRename) return null;

  return (
    <div className="dialog-wrapper" onClick={closeNodeRenameDialog}>
      <div
        className="dialog node-dialog shadow-xl w-1/2 flex flex-col border-gray-900 border-2 overflow-hidden rounded-lg"
        style={{ height: '112px' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex">
          <span className="bg-gray-500 p-6 flex-grow">
            <input
              id="fork-dialog-input"
              type="text"
              className="bg-gray-500 flex-grow placeholder-gray-700 outline-none text-lg"
              value={newName}
              onInput={(e) => setNewName(e.target.value)}
              autoFocus
            />
          </span>
          <div className="flex">
            <span
              className="bg-gray-600 text-gray-100 px-8 py-6 text-xl flex items-center justify-center font-bold cursor-pointer uppercase"
              onClick={() => renameNode(nodeToRename, newName)}
            >
              Rename
            </span>
            <span
              className="bg-gray-900 text-gray-600 p-6 text-2xl flex items-center justify-center font-bold cursor-pointer"
              onClick={closeNodeRenameDialog}
            >
              &times;
            </span>
          </div>
        </div>
        <div className="flex-grow bg-gray-700 text-gray-300 w-full h-full px-4 py-5">
          <p className="text-gray-500 mb-5">Type a new name for the node.</p>
        </div>
      </div>
    </div>
  );
}
