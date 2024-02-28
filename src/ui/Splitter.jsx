import React from 'react';

export default function Splitter({ className, parentRef, direction }) {
  function handleMouseDown(e) {
    e.preventDefault();
    const parent = parentRef.current;
    parent.style.cursor = direction === 'horizontal' ? 'ew-resize' : 'ns-resize';
    const mouseMoveHandler = (e) => {
      let sizePct;
      if (direction === 'horizontal') {
        sizePct = (e.clientX / parent.clientWidth) * 100;
      } else {
        sizePct = ((e.clientY - 40) / parent.clientHeight) * 100;
      }
      document.documentElement.style.setProperty(`--${className}`, `${sizePct}%`);
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
