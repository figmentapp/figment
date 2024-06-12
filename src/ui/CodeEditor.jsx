import React, { useState, useEffect, useRef } from 'react';
import CodeMirror from 'codemirror';
import 'codemirror/mode/javascript/javascript.js';
import 'codemirror/theme/darcula.css';
import clsx from 'clsx';

const CodeEditor = ({ nodeType, onBuildSource, onSourceModified, onShowForkDialog, modified }) => {
  const [source, setSource] = useState(nodeType.source);
  const editorRef = useRef(null);

  const isReadOnly = () => {
    const ns = nodeType.type.split('.')[0];
    return ns !== 'project';
  };

  useEffect(() => {
    const editor = CodeMirror.fromTextArea(editorRef.current, {
      lineNumbers: true,
      readOnly: isReadOnly(),
      mode: 'javascript',
      theme: 'darcula',
    });

    editor.setOption('extraKeys', {
      [`Shift-Enter`]: () => {
        onBuildSource(nodeType, editor.getValue());
        return false;
      },
    });

    editor.on('change', () => {
      if (source !== editor.getValue()) {
        onSourceModified(nodeType);
      }
    });

    return () => {
      editor.toTextArea();
    };
  }, [nodeType, onBuildSource, onSourceModified, source]);

  useEffect(() => {
    setSource(nodeType.source);
  }, [nodeType]);

  return (
    <div className="code flex-1 flex flex-col overflow-hidden">
      <div className={'flex-1 overflow-hidden ' + (isReadOnly() ? 'opacity-50' : '')}>
        <textarea className="code__area" ref={editorRef} defaultValue={source} readOnly={isReadOnly()} />
      </div>
      <div className="code__actions px-4 py-3 flex items-center justify-between bg-gray-900">
        {isReadOnly() && (
          <>
            <span className="text-gray-500">Code is read-only. Fork the code.</span>
            <button
              onClick={() => onShowForkDialog(nodeType)}
              className="bg-gray-700 px-4 py-1 rounded text-gray-200"
            >
              Fork
            </button>
          </>
        )}
        {!isReadOnly() && (
          <>
            <span className="text-gray-400">{nodeType.type}</span>
            <button
              onClick={() => onBuildSource(nodeType, editorRef.current.value)}
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
};

export default CodeEditor;
