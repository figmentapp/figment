import React, { useEffect, useRef } from 'react';
import { EditorView, basicSetup } from 'codemirror';
import { keymap } from '@codemirror/view';
import { EditorState, Prec } from '@codemirror/state';
import { javascript } from '@codemirror/lang-javascript';
import { darcula } from '@uiw/codemirror-theme-darcula';
import clsx from 'clsx';
import { useAppStore } from './store';

export default function CodeEditor() {
  const tabs = useAppStore((state) => state.tabs);
  const activeTabIndex = useAppStore((state) => state.activeTabIndex);
  const sourceModified = useAppStore((state) => state.sourceModified);
  const buildSource = useAppStore((state) => state.buildSource);
  const openForkDialog = useAppStore((state) => state.openForkDialog);

  const containerRef = useRef(null);
  const editorRef = useRef(null);

  const tab = tabs[activeTabIndex];
  const nodeType = tab?.nodeType;
  const modified = tab?.modified;
  const readOnly = nodeType ? nodeType.type.split('.')[0] !== 'project' : true;
  const source = tab?.uncommittedSource !== null && tab?.uncommittedSource !== undefined ? tab.uncommittedSource : nodeType?.source || '';

  const handleBuildSource = () => {
    if (editorRef.current && nodeType) {
      buildSource(nodeType, editorRef.current.state.doc.toString());
    }
  };

  useEffect(() => {
    if (!nodeType) return;

    const editor = new EditorView({
      parent: containerRef.current,
      doc: source,
      extensions: [
        basicSetup,
        javascript(),
        darcula,
        EditorState.readOnly.of(readOnly),
        Prec.highest(
          keymap.of([
            {
              key: 'Shift-Enter',
              run: () => {
                handleBuildSource();
                return true;
              },
            },
          ]),
        ),
        EditorView.updateListener.of((update) => {
          if (!update.docChanged) return;
          const currentSource = update.state.doc.toString();
          const { tabs, activeTabIndex } = useAppStore.getState();
          const currentTab = tabs[activeTabIndex];
          if (!currentTab?.nodeType) return;

          // Compare against uncommitted source if it exists, otherwise nodeType source
          const tabSource = currentTab.uncommittedSource !== null ? currentTab.uncommittedSource : currentTab.nodeType.source;
          if (tabSource !== currentSource) {
            sourceModified(currentTab.nodeType, currentSource);
          }
        }),
      ],
    });

    editorRef.current = editor;

    return () => {
      editor.destroy();
      editorRef.current = null;
    };
  }, [activeTabIndex, nodeType?.type]); // Remount when tab or nodeType changes

  return (
    <div className="code flex-1 flex flex-col overflow-hidden">
      <div ref={containerRef} className={'flex-1 overflow-hidden ' + (readOnly ? 'opacity-50' : '')} />
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
