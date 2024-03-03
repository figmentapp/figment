import React from 'react';
import { COLORS } from '../colors';

const MAX_HEIGHT = 16;

export default function OscWidget({ port, frequencies = [], onClick }) {
  if (!port) return null;
  let maxFrequency = Math.max(...frequencies);
  if (maxFrequency === 0) {
    maxFrequency = 0.0001;
  }
  const normalizedFrequencies = frequencies.map((f) => Math.max((f / maxFrequency) * MAX_HEIGHT, 1));
  return (
    <div className="border border-gray-600 rounded-sm text-gray-500 flex text-xs items-center gap-2 mr-2" onClick={onClick}>
      <div className="ml-2 w-2 h-2 bg-green-500 rounded-full mr-1"></div>
      <div className="py-1 pr-2 border-r border-gray-600">OSC {port}</div>
      <svg viewBox={`0 0 60 ${MAX_HEIGHT}`} width="60" height={MAX_HEIGHT} className="my-1">
        {normalizedFrequencies.map((f, i) => (
          <rect key={i} x={i * 2} y={MAX_HEIGHT - f} width={2} height={f} fill={COLORS.green500} />
        ))}
      </svg>
    </div>
  );
}
