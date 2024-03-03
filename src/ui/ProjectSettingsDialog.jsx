import React from 'react';
import clsx from 'clsx';
import Icon from './Icon';
import { COLORS } from '../colors';
import InlineEditor from './InlineEditor';

export default function ProjectSettingsDialog({ network, onChange, onCancel }) {
  console.log(network.settings);
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
          <label className="flex flex-row gap-2 items-center text-gray-200">
            <input
              type="checkbox"
              className="m-4"
              value={network.settings.oscEnabled}
              onChange={(e) => onChange('oscEnabled', e.target.checked)}
            />
            <span>Enable OSC</span>
          </label>
          <div className={clsx('mx-4 flex flex-row gap-2 items-center h-12 text-gray-200', { 'opacity-20': !network.settings.oscEnabled })}>
            <span>Port</span>
            <InlineEditor
              value={network.settings.oscPort || 8888}
              onChange={(v) => onChange('oscPort', parseInt(v) || 8888)}
              disabled={!network.settings.oscEnabled}
            />
          </div>
        </div>

        {/* Action bar */}
        <div className="flex flex-row justify-end mt-6  m-2 ">
          <button className="py-2 px-4 text-gray-200  bg-gray-600 hover:bg-gray-700" onClick={onCancel}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
