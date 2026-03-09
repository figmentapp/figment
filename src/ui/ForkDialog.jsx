import React, { useState, useEffect, useRef } from 'react';
function camelCase(str) {
  return str.replace(/[^a-zA-Z0-9]+(.)/g, (_, c) => c.toUpperCase()).replace(/^[A-Z]/, (c) => c.toLowerCase());
}
import { useAppStore } from './store';

export default function ForkDialog() {
  const forkDialogNodeType = useAppStore((s) => s.forkDialogNodeType);
  const network = useAppStore((s) => s.network);
  const selection = useAppStore((s) => s.selection);
  const closeForkDialog = useAppStore((s) => s.closeForkDialog);
  const forkNodeType = useAppStore((s) => s.forkNodeType);

  const [ns, setNs] = useState('project');
  const [newName, setNewName] = useState('');
  const [newTypeName, setNewTypeName] = useState('');
  const [currentNodes, setCurrentNodes] = useState([]);
  const [selectedNodes, setSelectedNodes] = useState(new Set());
  const [typeNameChanged, setTypeNameChanged] = useState(false);

  // Initialize state from nodeType
  useEffect(() => {
    if (!forkDialogNodeType) return;

    const [, baseName] = forkDialogNodeType.type.split('.');
    const nodes = network.nodes.filter((node) => node.type === forkDialogNodeType.type);

    const selected = new Set();
    for (const node of nodes) {
      if (selection.has(node)) {
        selected.add(node);
      }
    }

    setNs('project');
    setNewName(forkDialogNodeType.name);
    setNewTypeName(baseName);
    setCurrentNodes(nodes);
    setSelectedNodes(selected);
    setTypeNameChanged(false);
  }, [forkDialogNodeType, network, selection]);

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.keyCode === 27) {
        e.preventDefault();
        closeForkDialog();
      } else if (e.keyCode === 13) {
        e.preventDefault();
        handleFork();
      }
    };

    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [newName, newTypeName, ns, selectedNodes]);

  useEffect(() => {
    document.getElementById('fork-dialog-input')?.select();
  }, []);

  const handleFork = () => {
    const trimmedTypeName = newTypeName.trim();
    if (trimmedTypeName.length === 0) return closeForkDialog();
    const trimmedName = newName.trim();
    if (trimmedName.length === 0) return closeForkDialog();
    const fullTypeName = ns + '.' + trimmedTypeName;
    forkNodeType(forkDialogNodeType, trimmedName, fullTypeName, Array.from(selectedNodes));
  };

  const toggleSelectedNode = (node) => {
    setSelectedNodes((prev) => {
      const next = new Set(prev);
      if (next.has(node)) {
        next.delete(node);
      } else {
        next.add(node);
      }
      return next;
    });
  };

  const handleChangeName = (s) => {
    if (typeNameChanged) {
      // If the user has changed the type name, don't automatically update it.
      setNewName(s);
    } else {
      // User has not changed the type name, so change it as well.
      const generatedTypeName = camelCase(s.trim());
      setNewName(s);
      setNewTypeName(generatedTypeName);
    }
  };

  const handleChangeTypeName = (s) => {
    const typeName = camelCase(s);
    const proposedTypeName = camelCase(newName);
    setTypeNameChanged(typeName !== proposedTypeName);
    setNewTypeName(typeName);
  };

  if (!forkDialogNodeType) return null;

  return (
    <div className="dialog-wrapper" onClick={closeForkDialog}>
      <div
        className="dialog node-dialog shadow-xl w-1/2 flex flex-col border-gray-900 border-2 rounded-lg overflow-hidden"
        style={{ height: '40vh' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex">
          <input
            id="fork-dialog-input"
            type="text"
            className="p-6 bg-gray-500 flex-grow placeholder-gray-700 outline-none text-lg"
            value={newName}
            onInput={(e) => handleChangeName(e.target.value)}
            autoFocus
            maxLength={24}
          />
          <div className="flex">
            <span
              className="bg-gray-600 text-gray-100 px-8 py-6 text-xl flex items-center justify-center font-bold cursor-pointer uppercase"
              onClick={handleFork}
            >
              Fork
            </span>
            <span
              className="bg-gray-900 text-gray-600 p-6 text-2xl flex items-center justify-center font-bold cursor-pointer"
              onClick={closeForkDialog}
            >
              &times;
            </span>
          </div>
        </div>
        <div className="flex">
          <span className="bg-gray-600 p-6 flex-grow">
            <span className="text-lg">{ns}.</span>

            <input
              type="text"
              className="bg-gray-600 flex-grow placeholder-gray-700 outline-none text-lg"
              value={newTypeName}
              onInput={(e) => handleChangeTypeName(e.target.value)}
            />
          </span>
        </div>
        <div className="flex-grow bg-gray-700 text-gray-300 w-full h-full px-4 py-5">
          <p className="text-gray-500 mb-5">
            These nodes in the project are currently using the original code. Select them to link them to your forked code.
          </p>
          <div className="overflow-auto">
            {currentNodes &&
              currentNodes.map((node) => (
                <label className="block py-2 pr-2" key={node.id}>
                  <input type="checkbox" checked={selectedNodes.has(node)} onChange={() => toggleSelectedNode(node)} />
                  <span className="ml-2 text-small">{node.name}</span>
                </label>
              ))}
          </div>
        </div>
      </div>
    </div>
  );
}
