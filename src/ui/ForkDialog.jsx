import React, { useState, useEffect, useRef } from 'react';
import { camelCase } from 'lodash';

const ForkDialog = ({ nodeType, network, selection, onCancel, onForkNodeType }) => {
  let [ns, baseName] = nodeType.type.split('.');
  ns = 'project';
  const currentNodes = network.nodes.filter((node) => node.type === nodeType.type);

  const [newName, setNewName] = useState(nodeType.name);
  const [newTypeName, setNewTypeName] = useState(baseName);
  const [selectedNodes, setSelectedNodes] = useState(new Set());
  const [typeNameChanged, setTypeNameChanged] = useState(false);

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.keyCode === 27) {
        e.preventDefault();
        onCancel();
      } else if (e.keyCode === 13) {
        e.preventDefault();
        onFork();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [onCancel, onFork]);

  const onFork = () => {
    const trimmedNewTypeName = newTypeName.trim();
    if (trimmedNewTypeName.length === 0) return onCancel();
    const trimmedNewName = newName.trim();
    if (trimmedNewName.length === 0) return onCancel();
    const fullTypeName = ns + '.' + trimmedNewTypeName;
    onForkNodeType(nodeType, trimmedNewName, fullTypeName, Array.from(selectedNodes));
  };

  const toggleSelectedNode = (node) => {
    const newSelectedNodes = new Set(selectedNodes);
    if (newSelectedNodes.has(node)) {
      newSelectedNodes.delete(node);
    } else {
      newSelectedNodes.add(node);
    }
    setSelectedNodes(newSelectedNodes);
  };

  const onChangeName = (s) => {
    setNewName(s);
    if (!typeNameChanged) {
      const newTypeName = camelCase(s.trim());
      setNewTypeName(newTypeName);
    }
  };

  const onChangeTypeName = (s) => {
    const newTypeName = camelCase(s);
    const proposedTypeName = camelCase(newName);
    setTypeNameChanged(newTypeName !== proposedTypeName);
    setNewTypeName(newTypeName);
  };

  return (
    <div className="dialog-wrapper" onClick={onCancel}>
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
            onChange={(e) => onChangeName(e.target.value)}
            autoFocus
            maxLength={24}
          ></input>
          <div className="flex">
            <span
              className="bg-gray-600 text-gray-100 px-8 py-6 text-xl flex items-center justify-center font-bold cursor-pointer uppercase"
              onClick={onFork}
            >
              Fork
            </span>
            <span
              className="bg-gray-900 text-gray-600 p-6 text-2xl flex items-center justify-center font-bold cursor-pointer"
              onClick={onCancel}
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
              onChange={(e) => onChangeTypeName(e.target.value)}
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
};

export default ForkDialog;
