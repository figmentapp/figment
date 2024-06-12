import React, { useState, useEffect, useRef } from 'react';
import Library from '../model/Library';
import Fuse from 'fuse.js';

const NodeDialog = ({ network, onCreateNode, onCancel }) => {
  const nodeTypes = network.allNodeTypes();
  const options = {
    includeScore: true,
    keys: ['name', 'description']
  };
  const fuse = new Fuse(nodeTypes, options);
  const [q, setQ] = useState('');
  const [results, setResults] = useState(nodeTypes);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const currentNodeTypeRef = useRef(null);

  const onSearch = (e) => {
    const q = e.target.value;
    const results = q ? fuse.search(q).map(result => result.item) : nodeTypes;
    setQ(q);
    setResults(results);
    setSelectedIndex(0);
  };

  const onCreateNodeHandler = (nodeType) => {
    onCreateNode(nodeType);
  };

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        onCancel();
      } else if (e.key === 'ArrowDown') {
        let newIndex = selectedIndex + 1;
        if (newIndex >= results.length) {
          newIndex = 0;
        }
        setSelectedIndex(newIndex);
        if (currentNodeTypeRef.current && !isElementInViewport(currentNodeTypeRef.current)) {
          currentNodeTypeRef.current.scrollIntoView({ behavior: 'auto' });
        }
      } else if (e.key === 'ArrowUp') {
        let newIndex = selectedIndex - 1;
        if (newIndex < 0) {
          newIndex = results.length - 1;
        }
        setSelectedIndex(newIndex);
        if (currentNodeTypeRef.current && !isElementInViewport(currentNodeTypeRef.current)) {
          currentNodeTypeRef.current.scrollIntoView({ behavior: 'auto' });
        }
      } else if (e.key === 'Enter') {
        if (selectedIndex >= 0 && selectedIndex < results.length) {
          onCreateNode(results[selectedIndex]);
        }
      }
    };

    const isElementInViewport = (el) => {
      const rect = el.getBoundingClientRect();
      const parentRect = el.parentElement.getBoundingClientRect();
      return rect.top >= parentRect.top && rect.bottom <= parentRect.bottom;
    };

    window.addEventListener('keydown', handleKeyDown);
    document.getElementById('node-dialog-search').focus();

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [onCancel, onCreateNode, results, selectedIndex]);

  return (
    <div className="dialog-wrapper" onClick={onCancel}>
      <div
        className="bg-gray-800 dialog node-dialog shadow-xl w-1/2 rounded-lg overflow-hidden flex flex-col border-gray-900 border-2"
        style={{ height: '80vh' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex">
          <input
            id="node-dialog-search"
            type="search"
            className="bg-gray-500 flex-grow p-6 placeholder-gray-700 outline-none text-lg"
            placeholder="Type to search"
            onInput={onSearch}
            autoFocus
          ></input>
          <span
            className="bg-gray-900 text-gray-600 p-6 text-2xl flex items-center justify-center font-bold cursor-pointer"
            onClick={() => onCancel()}
          >
            &times;
          </span>
        </div>
        <div className="flex flex-col h-full overflow-y-auto flex-grow">
          {results.map((nodeType, index) => (
            <div
              ref={(index === selectedIndex && currentNodeTypeRef) || null}
              key={nodeType.type}
              className={`${
                index === selectedIndex ? 'bg-gray-600' : 'bg-gray-800'
              } p-4 flex items-center border-t border-gray-700 cursor-pointer`}
              onDoubleClick={() => onCreateNodeHandler(nodeType)}
            >
              <div className="flex-grow">
                <h4 className="text-xl text-gray-200">
                  {nodeType.name} <span className="text-sm text-gray-700">{nodeType.type}</span>
                </h4>
                <p className="text-gray-500 text-sm">{nodeType.description}</p>
              </div>
              <div className="ml-5">
                <div className="rounded-sm bg-gray-700 text-gray-400 text-xl w-8 h-8 flex items-center justify-center font-bold cursor-pointer">
                  <div onClick={() => onCreateNodeHandler(nodeType)}>+</div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default NodeDialog;
