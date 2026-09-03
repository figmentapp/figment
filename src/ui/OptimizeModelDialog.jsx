import React, { useState } from 'react';
import Icon from './Icon';
import { COLORS } from '../colors';
import { useAppStore } from './store';
import * as figment from '../figment';

const formatMB = (bytes) => `${(bytes / 1e6).toFixed(1)} MB`;

// File > Optimize ONNX Model…: converts a model for this GPU and writes the
// result next to it, the same conversion the ONNX Image Model node's
// `optimize` option runs on load, with the report shown instead of logged.
export default function OptimizeModelDialog() {
  const closeOptimizeModelDialog = useAppStore((s) => s.closeOptimizeModelDialog);
  const [status, setStatus] = useState('idle'); // idle | working | done | error
  const [message, setMessage] = useState('');
  const [result, setResult] = useState(null);

  const handleChoose = async () => {
    const modelPath = await window.desktop.showOpenFileDialog('onnx');
    if (!modelPath) return;
    setStatus('working');
    setResult(null);
    try {
      const fp16 = figment.getDevice().features.has('shader-f16');
      setMessage('Reading model…');
      const sourceBytes = await figment.fetchModelBytes(window.desktop.pathToFileURL(modelPath));
      const outcome = await figment.onnx.optimizeModel({
        modelPath,
        sourceBytes,
        fp16,
        desktop: window.desktop,
        session: figment.onnx.webgpuSession,
        onProgress: setMessage,
      });
      setResult({ ...outcome, fp16, modelPath });
      setStatus('done');
    } catch (e) {
      setMessage(e && e.message ? e.message : String(e));
      setStatus('error');
    }
  };

  const report = result?.report;
  return (
    <div className="dialog-wrapper" onClick={status === 'working' ? undefined : closeOptimizeModelDialog}>
      <div
        className="dialog node-dialog shadow-xl w-1/2 flex flex-col bg-gray-900 rounded-lg overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex flex-row justify-between items-center bg-gray-800">
          <span className="text-xl text-gray-400 py-4 px-6">Optimize ONNX Model</span>
          <Icon name="x" size={16} fill={COLORS.gray600} className="text-gray-600 cursor-pointer mr-4" onClick={closeOptimizeModelDialog} />
        </div>

        <div className="flex flex-col gap-4 p-6 text-gray-200">
          <div className="flex flex-col gap-2">
            <p className="text-gray-200">Convert a model to be more efficient.</p>
            <ul className="text-sm text-gray-400 list-disc pl-5">
              <li>Weights and activations become float16 when this GPU supports it: half the file, faster inference.</li>
              <li>Stride-2 ConvTranspose layers are rewritten as regular convolutions, which run several times faster.</li>
              <li>Constant calculations left by the exporter are folded into the weights.</li>
              <li>The result is compared with the original and only kept when it matches.</li>
              <li>
                It is written next to the model as <code>&lt;name&gt;.figment-optimized.onnx</code>; the ONNX Image Model node uses it when
                its <code>optimize</code> option is on.
              </li>
            </ul>
          </div>

          {status === 'idle' && (
            <button className="self-start px-4 py-2 rounded bg-gray-700 hover:bg-gray-600" onClick={handleChoose}>
              Choose model…
            </button>
          )}
          {status === 'working' && <p className="text-gray-300">{message}</p>}
          {status === 'error' && <p className="text-red-400">{message}</p>}

          {status === 'done' && result && (
            <div className="flex flex-col gap-2">
              <p className={result.status === 'verified' ? 'text-green-400' : 'text-yellow-400'}>
                {result.status === 'verified'
                  ? `Optimized model written to ${result.paths.model}`
                  : result.status === 'unchanged'
                    ? 'Nothing to optimize for this GPU; the original is used as is.'
                    : `The ${result.reason === 'fp16' ? 'float16' : 'rewritten'} model differs too much from the original; nothing was written.`}
              </p>
              <table className="text-sm">
                <tbody>
                  <tr>
                    <td className="pr-4 text-gray-400">Size</td>
                    <td>
                      {formatMB(report.bytes.before)} → {formatMB(report.bytes.after)}
                    </td>
                  </tr>
                  <tr>
                    <td className="pr-4 text-gray-400">Precision</td>
                    <td>{result.fp16 ? 'float16 (this GPU has shader-f16)' : 'float32 (this GPU has no shader-f16)'}</td>
                  </tr>
                  <tr>
                    <td className="pr-4 text-gray-400">ConvTranspose layers rewritten</td>
                    <td>
                      {report.convTranspose
                        ? `${report.convTranspose.rewritten} of ${report.convTranspose.rewritten + report.convTranspose.kept}`
                        : '0'}
                    </td>
                  </tr>
                  {report.fold && (
                    <tr>
                      <td className="pr-4 text-gray-400">Constant nodes folded</td>
                      <td>{report.fold.nodesFolded}</td>
                    </tr>
                  )}
                  <tr>
                    <td className="pr-4 text-gray-400">Nodes</td>
                    <td>
                      {report.before.nodes} → {report.after.nodes}
                    </td>
                  </tr>
                  <tr>
                    <td className="pr-4 text-gray-400">Rewritten graph vs original</td>
                    <td>
                      {Number.isFinite(result.exactness) ? `${result.exactness.toFixed(1)} dB` : 'identical'} (floor{' '}
                      {figment.onnx.EXACT_FLOOR_DB} dB)
                    </td>
                  </tr>
                  {result.fp16 && (
                    <tr>
                      <td className="pr-4 text-gray-400">Float16 vs original</td>
                      <td>
                        {Number.isFinite(result.psnr) ? `${result.psnr.toFixed(1)} dB` : 'identical'} (floor {figment.onnx.PSNR_FLOOR_DB}{' '}
                        dB)
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
              <button className="self-start px-4 py-2 rounded bg-gray-700 hover:bg-gray-600" onClick={() => setStatus('idle')}>
                Optimize another model…
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
