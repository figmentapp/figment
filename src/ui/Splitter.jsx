import React from 'react';
import { useAppStore } from './store';

export default function Splitter({ className, parentRef, direction }) {
  const setEditorSplitterWidth = useAppStore((s) => s.setEditorSplitterWidth);

  function handleMouseDown(e) {
    e.preventDefault();
    const parent = parentRef.current;
    parent.style.cursor = direction === 'horizontal' ? 'ew-resize' : 'ns-resize';
    const mouseMoveHandler = (e) => {
      if (direction === 'horizontal') {
        // Calculate params panel width (from splitter to right edge)
        const paramsWidth = parent.clientWidth - e.clientX;
        setEditorSplitterWidth(paramsWidth);
        document.documentElement.style.setProperty(`--${className}`, `${paramsWidth}px`);
      } else {
        const sizePct = ((e.clientY - 40) / parent.clientHeight) * 100;
        document.documentElement.style.setProperty(`--${className}`, `${sizePct}%`);
      }
    };
    const mouseUpHandler = () => {
      document.body.removeEventListener('mousemove', mouseMoveHandler);
      document.body.removeEventListener('mouseup', mouseUpHandler);
      parent.style.cursor = '';
    };
    document.body.addEventListener('mousemove', mouseMoveHandler);
    document.body.addEventListener('mouseup', mouseUpHandler);
  }

  return <div className={`resizer ${className}`} onMouseDown={handleMouseDown}></div>;
}
