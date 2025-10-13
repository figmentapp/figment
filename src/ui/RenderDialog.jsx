import React, { useState, useRef } from 'react';
import { useAppStore } from './store';

export default function RenderDialog() {
  const network = useAppStore((s) => s.network);
  const renderSequence = useAppStore((s) => s.renderSequence);
  const closeRenderDialog = useAppStore((s) => s.closeRenderDialog);

  const [frameCount, setFrameCount] = useState(100);
  const [frameRate, setFrameRate] = useState(60);
  const [currentFrame, setCurrentFrame] = useState(0);
  const [isRendering, setIsRendering] = useState(false);
  const cancelRequestedRef = useRef(false);

  const handleRenderFrameCallback = (frame) => {
    setCurrentFrame(frame);
    return !cancelRequestedRef.current;
  };

  const handleRender = async () => {
    setIsRendering(true);
    cancelRequestedRef.current = false;
    await renderSequence(frameCount, frameRate, handleRenderFrameCallback);
    if (cancelRequestedRef.current) {
      setIsRendering(false);
    } else {
      window.setTimeout(() => {
        setIsRendering(false);
      }, 1000);
    }
  };

  const handleRequestCancel = () => {
    cancelRequestedRef.current = true;
  };

  const handleClose = () => {
    if (isRendering) {
      cancelRequestedRef.current = true;
    }
    closeRenderDialog();
  };

  // Check if there are any "save image" nodes in the network.
  const saveImageNodes = network.nodes.filter((n) => n.type === 'image.saveImage');
  // Check if they all have a save folder set.
  const saveFolders = saveImageNodes.every((n) => !!n.inPorts.find((p) => p.name === 'folder').value);
  // Only enable rendering if the above conditions are met.
  const renderEnabled = saveImageNodes.length > 0 && saveFolders;

  return (
    <div className="dialog-wrapper">
      <div className="dialog node-dialog shadow-xl w-1/2 flex flex-col bg-gray-900 overflow-hidden rounded-lg">
        <div className="flex flex-col flex-1">
          {/* Top row */}
          <div className="flex flex-row justify-between items-center bg-gray-800">
            <span className="text-xl text-gray-400 py-4 px-6">Render All</span>
            <span className=" text-gray-600 text-2xl p-4 flex items-center justify-center font-bold cursor-pointer" onClick={handleClose}>
              &times;
            </span>
          </div>

          {/* Description */}
          <div className="flex flex-row items-center bg-gray-700 mb-6">
            <span className="text-gray-200 text-sm py-4 px-6">Render out all "Save Image" nodes.</span>
          </div>

          {/* Time range */}
          <div className="flex flex-row items-center mb-6">
            <span className="text-right w-40 mr-2 text-gray-400 px-4">Frames</span>
            <input
              className="bg-gray-800 text-gray-300 p-2 w-24"
              type="number"
              value={frameCount}
              onChange={(e) => setFrameCount(parseInt(e.target.value))}
            />
          </div>
          <div className="flex flex-row items-center">
            <span className="text-right w-40 mr-2 text-gray-400 px-4 truncate">Frame rate</span>
            <input
              className="bg-gray-800 text-gray-300 p-2 w-24"
              type="number"
              value={frameRate}
              onChange={(e) => setFrameRate(parseFloat(e.target.value))}
            />
          </div>

          <hr className="border-gray-800 my-6" />

          {/* Bottom row */}
          <div className="flex-1"></div>
          <div className="self-end flex flex-row-reverse justify-between items-center px-6 pb-6">
            {saveImageNodes.length === 0 && <span className="text-gray-400">No "Save Image" nodes found.</span>}
            {!saveFolders && <span className="text-gray-400">Not all "Save Image" nodes have a folder set.</span>}
            {!isRendering && renderEnabled && (
              <button className={`w-32 ml-2 bg-gray-800 text-gray-300 p-2 focus:outline-none`} onClick={handleRender}>
                Render
              </button>
            )}
            {isRendering && currentFrame < frameCount && (
              <>
                <span className="text-gray-300 p-2">
                  Exporting [{currentFrame} / {frameCount}]…
                </span>
                <button className={`w-32 ml-2 bg-gray-800 text-gray-300 p-2 focus:outline-none`} onClick={handleRequestCancel}>
                  Cancel
                </button>
              </>
            )}
            {isRendering && currentFrame >= frameCount && <span className="text-gray-300 p-2">Render done.</span>}
          </div>
        </div>
      </div>
    </div>
  );
}
