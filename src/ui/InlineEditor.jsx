import React from 'react';
import { useState, useRef, useEffect } from 'react';

// Because we use dynamic colors, Tailwind can't pick these up. So we'll mention them here explicitly:
// bg-gray-800 bg-gray-900 border-gray-700
// bg-green-800 bg-green-900 border-green-700
// bg-red-800 bg-red-900 border-red-700
export default function InlineEditor({ value, onChange, color = 'gray', disabled = false, onValidate = undefined, tooltip = undefined }) {
  const [inputValue, setInputValue] = useState(value);
  const [isEditing, setIsEditing] = useState(false);
  const inputRef = useRef(null);

  useEffect(() => {
    setInputValue(value);
  }, [value]);

  useEffect(() => {
    if (isEditing) {
      inputRef.current.select();
    }
  }, [isEditing]);

  const handleBlur = () => {
    if (!onValidate || onValidate(inputValue)) {
      onChange(inputValue);
    } else {
      setInputValue(value);
    }
    setIsEditing(false);
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.currentTarget.blur();
    } else if (e.key === 'Escape') {
      setInputValue(value);
      setIsEditing(false);
    }
  };
  if (isEditing) {
    return (
      <input
        ref={inputRef}
        type="text"
        value={inputValue}
        onChange={(e) => setInputValue(e.target.value)}
        onBlur={handleBlur}
        onKeyDown={handleKeyDown}
        className={`flex-1 bg-transparent bg-${color}-900 border border-${color}-700 outline-none mr-4 py-2 px-1 whitespace-nowrap text-gray-100`}
      />
    );
  } else {
    return (
      <span
        onClick={() => !disabled && setIsEditing(true)}
        className={`flex-1 whitespace-nowrap py-2 px-1 border border-transparent bg-${color}-800 text-gray-300 overflow-hidden`}
        title={tooltip}
      >
        {value}
      </span>
    );
  }
}
