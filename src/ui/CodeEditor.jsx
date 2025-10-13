import React, { useEffect, useRef } from 'react';
import CodeMirror from 'codemirror';
import 'codemirror/mode/javascript/javascript.js';
import 'codemirror/theme/darcula.css';
import clsx from 'clsx';
import { useAppStore } from './store';

export default function CodeEditor() {
  const tabs = useAppStore((state) => state.tabs);
  const activeTabIndex = useAppStore((state) => state.activeTabIndex);
  const sourceModified = useAppStore((state) => state.sourceModified);
  const buildSource = useAppStore((state) => state.buildSource);
  const openForkDialog = useAppStore((state) => state.openForkDialog);

  const editorRef = useRef(null);

  const tab = tabs[activeTabIndex];
  const nodeType = tab?.nodeType;
  const modified = tab?.modified;
  const readOnly = nodeType ? nodeType.type.split('.')[0] !== 'project' : true;
  const source = tab?.uncommittedSource !== null && tab?.uncommittedSource !== undefined ? tab.uncommittedSource : nodeType?.source || '';

  const handleBuildSource = () => {
    if (editorRef.current && nodeType) {
      buildSource(nodeType, editorRef.current.getValue());
    }
  };

  useEffect(() => {
    if (!nodeType) return;

    const $code = document.getElementById('code');
    const editor = CodeMirror.fromTextArea($code, {
      lineNumbers: true,
      readOnly: readOnly,
      mode: 'javascript',
      theme: 'darcula',
    });

    // Set initial value
    editor.setValue(source);

    // Keyboard shortcuts
    editor.setOption('extraKeys', {
      'Shift-Enter': () => {
        handleBuildSource();
        return false;
      },
    });

    editor.on('change', () => {
      const currentSource = editor.getValue();
      const { tabs, activeTabIndex } = useAppStore.getState();
      const currentTab = tabs[activeTabIndex];
      if (!currentTab?.nodeType) return;

      // Compare against uncommitted source if it exists, otherwise nodeType source
      const tabSource = currentTab.uncommittedSource !== null ? currentTab.uncommittedSource : currentTab.nodeType.source;
      if (tabSource !== currentSource) {
        sourceModified(currentTab.nodeType, currentSource);
      }
    });

    editorRef.current = editor;

    return () => {
      editor.toTextArea();
      editorRef.current = null;
    };
  }, [activeTabIndex, nodeType?.type]); // Remount when tab or nodeType changes

  return (
    <div className="code flex-1 flex flex-col overflow-hidden">
      <div className={'flex-1 overflow-hidden ' + (readOnly ? 'opacity-50' : '')}>
        <textarea className="code__area" id="code" defaultValue={source} readOnly={readOnly} />
      </div>
      <div className="code__actions px-4 py-3 flex items-center justify-between bg-gray-900">
        {readOnly && (
          <>
            {' '}
            <span className="text-gray-500">Code is read-only. Fork the code.</span>
            <button onClick={() => openForkDialog(nodeType)} className="bg-gray-700 px-4 py-1 rounded text-gray-200">
              Fork
            </button>
          </>
        )}
        {!readOnly && (
          <>
            <span className="text-gray-400">{nodeType?.type}</span>
            <button
              onClick={handleBuildSource}
              className={clsx('bg-gray-700 px-4 py-1 rounded text-gray-200', { 'opacity-20': !modified })}
              disabled={!modified}
            >
              Build
            </button>
          </>
        )}
      </div>
    </div>
  );
}
