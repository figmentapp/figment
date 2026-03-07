import React from 'react';
import { useAppStore } from './store';

export default function MigrationDialog() {
  const migration = useAppStore((s) => s.migration);
  const startMigration = useAppStore((s) => s.startMigration);
  const cancelMigration = useAppStore((s) => s.cancelMigration);

  if (!migration) return null;

  const { phase, webglTypeCount, nodeCount, nodesCompleted, error } = migration;

  const isConverting = phase === 'submitting' || phase === 'polling';
  const isDone = phase === 'done';
  const isFailed = phase === 'error';
  const progress = nodeCount > 0 ? nodesCompleted / nodeCount : 0;

  return (
    <div className="dialog-wrapper">
      <div
        className="dialog shadow-xl flex flex-col bg-gray-900 overflow-hidden rounded-lg"
        style={{ width: '640px' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex flex-row justify-center items-center bg-gray-800 py-5 px-6">
          <span className="text-xl text-gray-300">Your project is out of date and needs to be converted.</span>
        </div>

        {/* Body */}
        <div className="flex flex-col px-8 py-6 gap-4">
          {phase === 'prompt' && (
            <>
              <p className="text-gray-200 font-bold">Newer versions of Figment use WebGPU for performance.</p>
              <p className="text-gray-200 font-bold">
                Your project has {webglTypeCount} custom node{webglTypeCount !== 1 ? 's' : ''} that {webglTypeCount !== 1 ? 'are' : 'is'}{' '}
                still written in WebGL.
              </p>
              <p className="text-gray-400 mt-2">Figment can automatically convert your custom nodes.</p>
              <p className="text-gray-400">Your nodes will be sent to our servers for conversion.</p>
              <p className="text-gray-400">Project data is deleted immediately after processing.</p>
            </>
          )}

          {isConverting && (
            <>
              <p className="text-gray-200 font-bold">Converting...</p>
              {/* Progress bar */}
              <div className="w-full bg-gray-700 rounded-sm h-4 overflow-hidden">
                <div
                  className="h-full bg-gray-500 transition-all duration-500"
                  style={{ width: `${Math.max(progress * 100, isConverting && nodesCompleted === 0 ? 10 : 0)}%` }}
                />
              </div>
              {nodeCount > 0 && (
                <p className="text-gray-500 text-sm">
                  {nodesCompleted} of {nodeCount} node{nodeCount !== 1 ? 's' : ''} converted
                </p>
              )}
            </>
          )}

          {isDone && (
            <p className="text-gray-200">
              Conversion complete. {nodesCompleted} node{nodesCompleted !== 1 ? 's' : ''} converted successfully.
            </p>
          )}

          {isFailed && (
            <>
              <p className="text-red-400 font-bold">Conversion failed</p>
              <p className="text-gray-400 text-sm">{error}</p>
              <p className="text-gray-500 text-sm">You can try again or open the project with unconverted custom nodes.</p>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="flex flex-row justify-end items-center px-6 pb-6 pt-2 gap-3">
          {phase === 'prompt' && (
            <button className="px-6 py-2 bg-gray-700 text-gray-200 hover:bg-gray-600 rounded" onClick={startMigration}>
              Convert
            </button>
          )}
          {isFailed && (
            <>
              <button className="px-6 py-2 bg-gray-800 text-gray-400 hover:bg-gray-700 rounded" onClick={() => cancelMigration(true)}>
                Open Without Converting
              </button>
              <button className="px-6 py-2 bg-gray-700 text-gray-200 hover:bg-gray-600 rounded" onClick={startMigration}>
                Retry
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
