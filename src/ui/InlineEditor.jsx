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
  // The latest draft and callbacks, readable from the unmount cleanup below.
  const draftRef = useRef({ value, inputValue, onChange, onValidate });
  draftRef.current = { value, inputValue, onChange, onValidate };
  // True once the edit ended through blur or Escape, so the unmount cleanup stays quiet.
  const settledRef = useRef(false);

  useEffect(() => {
    setInputValue(value);
  }, [value]);

  useEffect(() => {
    if (isEditing) {
      inputRef.current.select();
    }
  }, [isEditing]);

  const commit = () => {
    const { value, inputValue, onChange, onValidate } = draftRef.current;
    if (inputValue === value) return;
    if (!onValidate || onValidate(inputValue)) {
      onChange(inputValue);
    } else {
      setInputValue(value);
    }
  };

  // Mouse-down handlers elsewhere (the network canvas, splitters) call preventDefault,
  // so the input can lose its place without ever blurring. Commit the draft when the
  // input unmounts while an edit is still open.
  useEffect(() => {
    if (!isEditing) return;
    settledRef.current = false;
    return () => {
      if (!settledRef.current) commit();
    };
  }, [isEditing]);

  const handleBlur = () => {
    commit();
    settledRef.current = true;
    setIsEditing(false);
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.currentTarget.blur();
    } else if (e.key === 'Escape') {
      settledRef.current = true;
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
