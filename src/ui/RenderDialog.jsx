import React, { useState, useEffect } from 'react';

const RenderDialog = ({ network, renderSequence, onCancel }) => {
  const [state, setState] = useState({
    frameCount: 100,
    frameRate: 60,
    currentFrame: 0,
    isRendering: false,
    cancelRequested: false,
  });

  const _onRender = async () => {
    setState((prevState) => ({ ...prevState, isRendering: true, cancelRequested: false }));
    await renderSequence(state.frameCount, state.frameRate, _renderFrameCallback);
    if (state.cancelRequested) {
      setState((prevState) => ({ ...prevState, isRendering: false }));
    } else {
      setTimeout(() => {
        setState((prevState) => ({ ...prevState, isRendering: false }));
      }, 1000);
    }
  };

  const _renderFrameCallback = (currentFrame) => {
    setState((prevState) => ({ ...prevState, currentFrame }));
    return !state.cancelRequested;
  };

  const _onRequestCancel = () => {
    setState((prevState) => ({ ...prevState, cancelRequested: true }));
  };

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onCancel();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [onCancel]);

  return (
    <div className="dialog-wrapper" onClick={onCancel}>
      <div className="dialog node-dialog shadow-xl w-1/2 flex flex-col bg-gray-900 overflow-hidden rounded-lg">
        <div className="flex flex-col flex-1">
          <div className="flex flex-row justify-between items-center bg-gray-800">
            <span className="text-xl text-gray-400 py-4 px-6">Render All</span>
            <span
              className="text-gray-600 text-2xl p-4 flex items-center justify-center font-bold cursor-pointer"
              onClick={onCancel}
            >
              &times;
            </span>
          </div>
          <div className="flex flex-row items-center bg-gray-700 mb-6">
            <span className="text-gray-200 text-sm py-4 px-6">Render out all "Save Image" nodes.</span>
          </div>
          <div className="flex flex-row items-center mb-6">
            <span className="text-right w-40 mr-2 text-gray-400 px-4">Frames</span>
            <input
              className="bg-gray-800 text-gray-300 p-2 w-24"
              type="number"
              value={state.frameCount}
              onChange={(e) => setState((prevState) => ({ ...prevState, frameCount: parseInt(e.target.value) }))}
            />
          </div>
          <div className="flex flex-row items-center">
            <span className="text-right w-40 mr-2 text-gray-400 px-4 truncate">Frame rate</span>
            <input
              className="bg-gray-800 text-gray-300 p-2 w-24"
              type="number"
              value={state.frameRate}
              onChange={(e) => setState((prevState) => ({ ...prevState, frameRate: parseFloat(e.target.value) }))}
            />
          </div>
          <hr className="border-gray-800 my-6" />
          <div className="self-end flex flex-row-reverse justify-between items-center px-6 pb-6">
            <button
              className={`w-32 ml-2 bg-gray-800 text-gray-300 p-2 focus:outline-none ${state.isRendering ? 'hidden' : ''}`}
              onClick={_onRender}
            >
              Render
            </button>
            {state.isRendering && (
              <>
                <span className="text-gray-300 p-2">
                  Exporting [{state.currentFrame} / {state.frameCount}]…
                </span>
                <button className="w-32 ml-2 bg-gray-800 text-gray-300 p-2 focus:outline-none" onClick={_onRequestCancel}>
                  Cancel
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default RenderDialog;
