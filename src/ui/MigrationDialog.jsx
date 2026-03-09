import React, { useState, useEffect, useRef } from 'react';
import { useAppStore } from './store';

export default function MigrationDialog() {
  const migration = useAppStore((s) => s.migration);
  const startMigration = useAppStore((s) => s.startMigration);
  const cancelMigration = useAppStore((s) => s.cancelMigration);

  const isConverting = migration && (migration.phase === 'submitting' || migration.phase === 'polling');
  const [animPct, setAnimPct] = useState(0);
  const startTimeRef = useRef(null);

  useEffect(() => {
    if (!isConverting) {
      setAnimPct(0);
      startTimeRef.current = null;
      return;
    }
    startTimeRef.current = Date.now();
    const handle = setInterval(() => {
      const elapsed = Date.now() - startTimeRef.current;
      setAnimPct(90 * (1 - Math.exp(-elapsed / 15000)));
    }, 100);
    return () => clearInterval(handle);
  }, [isConverting]);

  if (!migration) return null;

  const { phase, webglTypeCount, nodeCount, nodesCompleted, error } = migration;

  const isDone = phase === 'done';
  const isFailed = phase === 'error';
  const realPct = nodeCount > 0 ? (nodesCompleted / nodeCount) * 100 : 0;
  const barPct = isDone ? 100 : Math.max(animPct, realPct);

  return (
    <div className="dialog-wrapper">
      <div
        className="dialog shadow-xl flex flex-col bg-gray-900 overflow-hidden rounded-lg"
        style={{ width: '600px' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header band */}
        <div className="bg-gray-800 py-5 px-8 text-center">
          <span className="text-gray-300" style={{ fontSize: '15px' }}>
            Your project is out of date and needs to be converted.
          </span>
        </div>

        {/* Body */}
        <div className="px-8 pt-6 pb-2">
          {phase === 'prompt' && (
            <>
              {/* Primary message — tight block */}
              <p className="text-gray-200 font-bold leading-relaxed">
                Newer versions of Figment use WebGPU for performance.
                <br />
                Your project has {webglTypeCount} custom node{webglTypeCount !== 1 ? 's' : ''} that {webglTypeCount !== 1 ? 'are' : 'is'}{' '}
                still written in WebGL.
              </p>
              {/* Secondary details — grouped, muted */}
              <div className="mt-5 text-gray-500 leading-relaxed">
                <p>Figment can automatically convert your custom nodes.</p>
                <p>Your nodes will be sent to our servers for conversion.</p>
                <p>Project data is deleted immediately after processing.</p>
              </div>
            </>
          )}

          {isConverting && (
            <>
              <p className="text-gray-200 font-bold mb-3">Converting…</p>
              <div className="w-full h-3 border border-gray-700 rounded-sm overflow-hidden">
                <div
                  className="h-full bg-gray-500 transition-all duration-700 ease-out"
                  style={{ width: `${barPct.toFixed(1)}%` }}
                />
              </div>
              {nodeCount > 0 && (
                <p className="text-gray-600 mt-2">
                  {nodesCompleted} / {nodeCount} node{nodeCount !== 1 ? 's' : ''}
                </p>
              )}
            </>
          )}

          {isDone && (
            <p className="text-gray-300">
              Conversion complete — {nodesCompleted} node{nodesCompleted !== 1 ? 's' : ''} converted.
            </p>
          )}

          {isFailed && (
            <>
              <p className="text-red-400 font-bold">Conversion failed</p>
              <p className="text-gray-500 mt-2 break-words">{error}</p>
              <p className="text-gray-600 mt-3">You can retry or open the project with the original WebGL code.</p>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-between items-center gap-3 px-8 py-5">
          <span className="text-gray-600">
            You can also convert online at{' '}
            <button
              className="text-gray-500 underline underline-offset-2 hover:text-gray-300 transition-colors cursor-pointer"
              onClick={() => window.desktop.openExternal('https://migration.figmentapp.com')}
            >
              migration.figmentapp.com
            </button>
            .
          </span>
          {phase === 'prompt' && (
            <button
              className="px-5 py-1.5 border border-gray-600 text-gray-300 hover:bg-gray-800 hover:border-gray-500 transition-colors rounded-sm"
              onClick={startMigration}
            >
              Convert
            </button>
          )}
          {isFailed && (
            <>
              <button className="px-5 py-1.5 text-gray-500 hover:text-gray-300 transition-colors" onClick={() => cancelMigration(true)}>
                Open Without Converting
              </button>
              <button
                className="px-5 py-1.5 border border-gray-600 text-gray-300 hover:bg-gray-800 hover:border-gray-500 transition-colors rounded-sm"
                onClick={startMigration}
              >
                Retry
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
