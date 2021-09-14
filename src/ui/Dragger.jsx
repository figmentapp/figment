import React from 'react';
import { COLORS } from '../colors';

function clamp(v, min, max) {
  return v < min ? min : v > max ? max : v;
}

export default function Dragger({ label, value, onChange, min, max, step }) {
  let _startX;
  function onMouseDown(e) {
    e.preventDefault();
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    _startX = e.clientX;
  }

  function onMouseMove(e) {
    e.preventDefault();
    const dx = e.clientX - _startX;
    const _step = step || 1;
    const newValue = clamp(value + dx * _step, min, max);
    onChange(newValue);
  }

  function onMouseUp(e) {
    e.preventDefault();
    window.removeEventListener('mousemove', onMouseMove);
    window.removeEventListener('mouseup', onMouseUp);
  }

  return (
    <div style={styles.wrapper}>
      <input
        className="outline-none focus:shadow-outline focus:bg-gray-800"
        style={styles.field}
        type="text"
        value={step ? value : Math.round(value)}
        onChange={e => onChange(parseInt(e.target.value))}
        min={min}
        max={max}
        step={step || 1}
      />
      <div style={styles.label} onMouseDown={onMouseDown}>
        {label}
      </div>
    </div>
  );
}

const styles = {
  wrapper: {
    width: '35px',
    height: '40px',
    display: 'flex',
    flexDirection: 'column'
  },
  field: {
    background: COLORS.gray900,
    border: '1px solid rgba(255, 255, 255, 0.15)',
    padding: '2px 5px',
    color: 'white',
    font: 'inherit',
    fontSize: '10px',
    borderRadius: '3px'
  },
  label: {
    marginTop: '2px',
    fontSize: '11px',
    textAlign: 'center',
    cursor: 'col-resize',
    color: COLORS.gray600
  }
};
