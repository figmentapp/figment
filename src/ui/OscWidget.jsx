import React from 'react';

export default function OscWidget({ port, frequencies = [] }) {
  if (!port) return null;
  console.log(frequencies);
  let maxFrequency = Math.max(...frequencies);
  if (maxFrequency === 0) {
    maxFrequency = 0.0001;
  }
  const normalizedFrequencies = frequencies.map((f) => (f / maxFrequency) * 100);
  console.log(normalizedFrequencies);
  return (
    <div className="border border-gray-600 rounded-sm text-gray-500 flex text-xs items-center gap-2 mr-2">
      <div className="ml-2 w-2 h-2 bg-green-500 rounded-full mr-1"></div>
      <div className="py-1 pr-2 border-r border-gray-600">OSC {port}</div>
      <svg viewBox="0 0 120 100" width="60" height="20" className="py-1">
        {normalizedFrequencies.map((f, i) => (
          <rect key={i} x={i * 2} y={100 - f} width="2" height={f} fill="rgba(0,255,0,0.5)" />
        ))}
      </svg>
      <div>Messages per second: {frequencies.reduce((a, b) => a + b, 0)}</div>
    </div>
  );
}
