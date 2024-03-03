import React from 'react';
import Icon from './Icon';
import { COLORS } from '../colors';

export default function ProjectSettingsDialog({ onCancel }) {
  return (
    <div className="dialog-wrapper">
      <div className="dialog node-dialog shadow-xl w-1/2 flex flex-col bg-gray-900">
        {/* Top row */}
        <div className="flex flex-row justify-between items-center bg-gray-800">
          <span className="text-xl text-gray-400 py-4 px-6">Project Settings</span>
          <Icon name="x" size={16} fill={COLORS.gray600} className="text-gray-600 cursor-pointer mr-4" onClick={onCancel} />
        </div>

        {/* OSC */}
        <div className="flex flex-col  mb-6">
          <div className="text-gray-200 text-sm py-4 px-6 font-bold">OSC</div>
          <div className="flex flex-row gap-2 items-center h-12 text-gray-200">
            <input type="checkbox" className="m-4" />
            <span>OSC Port</span>
            <input type="text" value={8080} />
          </div>
        </div>
      </div>
    </div>
  );
}
