import { h } from 'preact';

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
        style={styles.field}
        type="text"
        value={value}
        onFocus={e => (e.target.type = 'number')}
        onBlur={e => (e.target.type = 'text')}
        onInput={e => onChange(parseInt(e.target.value))}
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
    height: '35px',
    display: 'flex',
    flexDirection: 'column'
  },
  field: {
    background: '#454545',
    border: '1px solid rgba(255, 255, 255, 0.2)',
    padding: '2px 5px',
    color: 'white',
    font: 'inherit',
    borderRadius: '3px'
  },
  label: {
    marginTop: '2px',
    textAlign: 'center',
    cursor: 'col-resize'
  }
};
