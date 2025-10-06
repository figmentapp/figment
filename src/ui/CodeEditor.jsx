import React, { useEffect, useRef } from 'react';
import CodeMirror from 'codemirror';
import 'codemirror/mode/javascript/javascript.js';
import 'codemirror/theme/darcula.css';
import clsx from 'clsx';
import { useAppStore } from './store';

export default function CodeEditor() {
  const sourceModified = useAppStore((state) => state.sourceModified);
  const buildSource = useAppStore((state) => state.buildSource);
  const openForkDialog = useAppStore((state) => state.openForkDialog);

  const editorRef = useRef(null);

  const getCurrentTab = () => {
    const { tabs, activeTabIndex } = useAppStore.getState();
    return tabs[activeTabIndex];
  };

  const isReadOnly = () => {
    const tab = getCurrentTab();
    if (!tab?.nodeType) return true;
    const ns = tab.nodeType.type.split('.')[0];
    return ns !== 'project';
  };

  const handleBuildSource = () => {
    try {
      const tab = getCurrentTab();
      if (tab?.nodeType) {
        buildSource(tab.nodeType, editorRef.current.getValue());
      }
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    const $code = document.getElementById('code');
    const editor = CodeMirror.fromTextArea($code, {
      lineNumbers: true,
      readOnly: isReadOnly(),
      mode: 'javascript',
      theme: 'darcula',
    });

    // Set initial value from uncommitted source if available
    const tab = getCurrentTab();
    if (tab) {
      const initialSource = tab.uncommittedSource !== null ? tab.uncommittedSource : tab.nodeType?.source;
      if (initialSource) {
        editor.setValue(initialSource);
      }
    }

    editor.setOption('extraKeys', {
      'Shift-Enter': () => {
        handleBuildSource();
        return false;
      },
    });
    editor.on('change', () => {
      const currentSource = editor.getValue();
      const tab = getCurrentTab();
      if (tab?.nodeType) {
        // Compare against uncommitted source if it exists, otherwise nodeType source
        const tabSource = tab.uncommittedSource !== null ? tab.uncommittedSource : tab.nodeType.source;
        if (tabSource !== currentSource) {
          sourceModified(tab.nodeType, currentSource);
        }
      }
    });
    editorRef.current = editor;

    return () => {
      editor.toTextArea();
    };
  }, []);

  // Subscribe to tab changes to update editor
  // Only update editor when tab changes or nodeType changes, not on every store update
  useEffect(() => {
    // Initialize prevTabKey to current tab to avoid triggering on first store change
    const { tabs, activeTabIndex } = useAppStore.getState();
    const initialTab = tabs[activeTabIndex];
    let prevTabKey = initialTab?.nodeType ? `${activeTabIndex}-${initialTab.nodeType.type}` : null;

    const unsubscribe = useAppStore.subscribe(() => {
      const { tabs, activeTabIndex } = useAppStore.getState();
      const tab = tabs[activeTabIndex];

      // Create a key to detect actual tab changes (not just modified flag changes)
      const currentTabKey = tab?.nodeType ? `${activeTabIndex}-${tab.nodeType.type}` : null;

      // Only update editor if we switched tabs or the tab's nodeType changed
      if (currentTabKey !== prevTabKey) {
        prevTabKey = currentTabKey;

        if (editorRef.current && tab?.nodeType) {
          // Load uncommitted source if it exists, otherwise load from nodeType
          const source = tab.uncommittedSource !== null ? tab.uncommittedSource : tab.nodeType.source;
          editorRef.current.setValue(source);

          // Calculate readOnly directly here to avoid closure issues
          const ns = tab.nodeType.type.split('.')[0];
          const readOnly = ns !== 'project';
          editorRef.current.setOption('readOnly', readOnly);
        }
      }
    });

    return () => unsubscribe();
  }, []);

  // Get current tab data for rendering
  const tab = getCurrentTab();
  const readOnly = isReadOnly();
  const nodeType = tab?.nodeType;
  const modified = tab?.modified;
  // Use uncommitted source if it exists, otherwise use nodeType source
  const source = tab?.uncommittedSource !== null && tab?.uncommittedSource !== undefined
    ? tab.uncommittedSource
    : (nodeType?.source || '');

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
