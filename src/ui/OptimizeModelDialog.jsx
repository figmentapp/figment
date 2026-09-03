import React, { useState } from 'react';
import { useAppStore } from './store';
import * as figment from '../figment';
import { baseName } from '../onnx/optimize.js';

const formatMB = (bytes) => `${(bytes / 1e6).toFixed(1)} MB`;

// File > Optimize ONNX Model…: converts a model for this GPU and writes the
// result next to it, the same conversion the ONNX Image Model node's
// `optimize` option runs on load, with the report shown instead of logged.
export default function OptimizeModelDialog() {
  const closeOptimizeModelDialog = useAppStore((s) => s.closeOptimizeModelDialog);
  const [modelPath, setModelPath] = useState(null);
  const [status, setStatus] = useState('idle'); // idle | working | done | error
  const [progress, setProgress] = useState({ message: '', fraction: 0 });
  const [result, setResult] = useState(null);

  const handleChoose = async () => {
    const filePath = await window.desktop.showOpenFileDialog('onnx');
    if (!filePath) return;
    setModelPath(filePath);
    setStatus('idle');
    setResult(null);
  };

  const handleOptimize = async () => {
    setStatus('working');
    setResult(null);
    setProgress({ message: 'Reading model…', fraction: 0.02 });
    try {
      const fp16 = figment.getDevice().features.has('shader-f16');
      const sourceBytes = await figment.fetchModelBytes(window.desktop.pathToFileURL(modelPath));
      const outcome = await figment.onnx.optimizeModel({
        modelPath,
        sourceBytes,
        fp16,
        desktop: window.desktop,
        session: figment.onnx.webgpuSession,
        onProgress: (message, fraction) => setProgress({ message, fraction }),
      });
      setProgress({ message: 'Done.', fraction: 1 });
      setResult({ ...outcome, fp16 });
      setStatus('done');
    } catch (e) {
      setProgress({ message: e && e.message ? e.message : String(e), fraction: 0 });
      setStatus('error');
    }
  };

  const report = result?.report;
  const outcomeText = !result
    ? ''
    : result.status === 'verified'
      ? 'Optimized model written.'
      : result.status === 'unchanged'
        ? 'This model is already optimized; nothing to do.'
        : `The ${result.reason === 'fp16' ? 'float16' : 'rewritten'} model differs too much from the original; nothing was written.`;

  return (
    <div className="dialog-wrapper">
      <div className="dialog node-dialog shadow-xl w-1/2 flex flex-col bg-gray-900 overflow-hidden rounded-lg">
        <div className="flex flex-col flex-1">
          {/* Top row */}
          <div className="flex flex-row justify-between items-center bg-gray-800">
            <span className="text-xl text-gray-400 py-4 px-6">Optimize ONNX Model</span>
            <span
              className="text-gray-600 text-2xl p-4 flex items-center justify-center font-bold cursor-pointer"
              onClick={status === 'working' ? undefined : closeOptimizeModelDialog}
            >
              &times;
            </span>
          </div>

          {/* Description */}
          <div className="flex flex-row justify-between items-center bg-gray-700">
            <span className="text-gray-200 text-sm py-4 px-6">Convert a model to be more efficient.</span>
          </div>

          {/* Model */}
          <div className="flex flex-row items-center mt-6 mb-6">
            <span className="text-right w-48 mr-2 text-gray-400 px-4">Model</span>
            <span className="text-gray-300 truncate flex-1">{modelPath ? baseName(modelPath) : 'No model chosen'}</span>
            <button
              className="w-32 mx-6 bg-gray-800 text-gray-300 p-2 focus:outline-none"
              onClick={handleChoose}
              disabled={status === 'working'}
            >
              Choose…
            </button>
          </div>

          {/* Progress */}
          {status !== 'idle' && (
            <div className="flex flex-col mx-6 mb-6 gap-2">
              <div className="w-full h-2 bg-gray-800 rounded overflow-hidden">
                <div
                  className={`h-2 ${status === 'error' ? 'bg-red-500' : 'bg-blue-500'} transition-all`}
                  style={{ width: `${Math.round(progress.fraction * 100)}%` }}
                />
              </div>
              <span className={`text-sm ${status === 'error' ? 'text-red-400' : 'text-gray-400'}`}>{progress.message}</span>
            </div>
          )}

          {/* Report */}
          {status === 'done' && result && (
            <div className="flex flex-col mx-6 mb-6 gap-2">
              <span className={result.status === 'verified' ? 'text-green-400' : 'text-yellow-400'}>{outcomeText}</span>
              {result.status === 'verified' && <span className="text-sm text-gray-400 break-all">{result.paths.model}</span>}
              <table className="text-sm text-gray-300">
                <tbody>
                  <tr>
                    <td className="pr-4 text-gray-400">Size</td>
                    <td>
                      {formatMB(report.bytes.before)} → {formatMB(report.bytes.after)}
                    </td>
                  </tr>
                  <tr>
                    <td className="pr-4 text-gray-400">Precision</td>
                    <td>{result.fp16 ? 'float16' : 'float32 (this GPU has no shader-f16)'}</td>
                  </tr>
                  <tr>
                    <td className="pr-4 text-gray-400">ConvTranspose layers rewritten</td>
                    <td>{report.convTranspose ? report.convTranspose.rewritten : 0}</td>
                  </tr>
                  {report.fold && (
                    <tr>
                      <td className="pr-4 text-gray-400">Constant nodes folded</td>
                      <td>{report.fold.nodesFolded}</td>
                    </tr>
                  )}
                  <tr>
                    <td className="pr-4 text-gray-400">Rewritten graph vs original</td>
                    <td>{Number.isFinite(result.exactness) ? `${result.exactness.toFixed(1)} dB` : 'identical'}</td>
                  </tr>
                  {result.fp16 && (
                    <tr>
                      <td className="pr-4 text-gray-400">Float16 vs original</td>
                      <td>{Number.isFinite(result.psnr) ? `${result.psnr.toFixed(1)} dB` : 'identical'}</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}

          <hr className="border-gray-800 mb-6" />

          {/* Bottom row */}
          <div className="flex-1"></div>
          <div className="self-end flex flex-row-reverse justify-between items-center px-6 pb-6">
            {status === 'working' ? (
              <span className="text-gray-300 p-2">Optimizing…</span>
            ) : status === 'done' ? (
              <button className="w-32 ml-2 bg-gray-800 text-gray-300 p-2 focus:outline-none" onClick={closeOptimizeModelDialog}>
                Close
              </button>
            ) : (
              <button
                className={`w-32 ml-2 bg-gray-800 text-gray-300 p-2 focus:outline-none ${modelPath ? '' : 'opacity-40'}`}
                onClick={handleOptimize}
                disabled={!modelPath}
              >
                Optimize
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
