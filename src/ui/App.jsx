import React, { useCallback, useEffect, useRef, useState } from 'react';
import Stats from 'stats.js';
import * as figment from '../figment';
import Editor from './Editor';
import Viewer from './Viewer';
import ParamsEditor from './ParamsEditor';
import NodeDialog from './NodeDialog';
import Splitter from './Splitter';
import ForkDialog from './ForkDialog';
import NodeRenameDialog from './NodeRenameDialog';
import RenderDialog from './RenderDialog';
import MigrationDialog from './MigrationDialog';
import ProjectSettingsDialog from './ProjectSettingsDialog';
import { initExpressionContext } from '../expr';
import { useAppStore } from './store';

window.stats = new Stats();
window.stats.dom.style.top = '';
window.stats.dom.style.bottom = '0';

export default function App(props) {
  const mainRef = useRef(null);
  const [gpuStatus, setGpuStatus] = useState('uninitialized');

  // Selectively subscribe to only the state we need
  const fullscreen = useAppStore((state) => state.fullscreen);
  const showNodeDialog = useAppStore((state) => state.showNodeDialog);
  const showForkDialog = useAppStore((state) => state.showForkDialog);
  const showRenderDialog = useAppStore((state) => state.showRenderDialog);
  const showProjectSettingsDialog = useAppStore((state) => state.showProjectSettingsDialog);
  const showNodeRenameDialog = useAppStore((state) => state.showNodeRenameDialog);
  const migration = useAppStore((state) => state.migration);

  // Actions
  const startNetwork = useAppStore((state) => state.startNetwork);
  const start = useAppStore((state) => state.start);
  const doFrame = useAppStore((state) => state.doFrame);
  const forceRedraw = useAppStore((state) => state.forceRedraw);
  const toggleFullscreen = useAppStore((state) => state.toggleFullscreen);
  const handleMenuEvent = useAppStore((state) => state.handleMenuEvent);
  const handleOscEvent = useAppStore((state) => state.handleOscEvent);
  const handleMidiEvent = useAppStore((state) => state.handleMidiEvent);
  const handleMidiProgramChange = useAppStore((state) => state.handleMidiProgramChange);
  const openFile = useAppStore((state) => state.openFile);
  const setEditorSplitterWidth = useAppStore((state) => state.setEditorSplitterWidth);

  useEffect(() => {
    function doInit() {
      figment
        .initGPU({ powerPreference: 'high-performance' })
        .then(() => {
          setGpuStatus('ready');
        })
        .catch((err) => {
          console.error('WebGPU init failed:', err);
          setGpuStatus(figment.getGPUStatus());
        });
    }

    // Chromium defers requestAdapter() for hidden/backgrounded pages.
    // Since Electron creates the window with show:false, we must wait
    // until the page is visible before requesting the GPU adapter.
    if (document.visibilityState === 'visible') {
      doInit();
    } else {
      const onVisible = () => {
        if (document.visibilityState === 'visible') {
          document.removeEventListener('visibilitychange', onVisible);
          doInit();
        }
      };
      document.addEventListener('visibilitychange', onVisible);
    }

    figment.onDeviceLost(() => {
      setGpuStatus('lost');
    });
  }, []);

  // Initialize editor splitter width from actual DOM dimensions
  useEffect(() => {
    const mainEl = mainRef.current;
    if (mainEl) {
      // Wait a frame for layout to complete
      requestAnimationFrame(() => {
        const paramsEl = mainEl.querySelector('.params');
        if (paramsEl) {
          const paramsWidth = paramsEl.offsetWidth;
          setEditorSplitterWidth(paramsWidth);
        }
      });
    }
  }, [setEditorSplitterWidth]);

  // One-time: expression context for OSC/MIDI
  useEffect(() => {
    const { oscMessageMap, midiMessageMap, midiProgramChangeMap } = useAppStore.getState();
    initExpressionContext({ _osc: oscMessageMap, _midi: midiMessageMap, _midipc: midiProgramChangeMap });
  }, []);

  // Start the network and open initial file only after the GPU device is ready
  useEffect(() => {
    if (gpuStatus === 'ready') {
      startNetwork();
      const initialPath = props.filePath || useAppStore.getState().filePath;
      if (initialPath) openFile(initialPath);
    }
  }, [gpuStatus, startNetwork, props.filePath, openFile]);

  const undo = useAppStore((state) => state.undo);
  const redo = useAppStore((state) => state.redo);

  const onKeyDown = useCallback(
    (e) => {
      if (e.keyCode === 27 && useAppStore.getState().fullscreen) toggleFullscreen();
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key === 'z') {
        e.preventDefault();
        undo();
      }
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'z') {
        e.preventDefault();
        redo();
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 'y') {
        e.preventDefault();
        redo();
      }
    },
    [toggleFullscreen, undo, redo],
  );

  // Wire listeners and RAF loop explicitly here
  useEffect(() => {
    let rafId;
    async function frame() {
      window.stats.begin();
      performance.mark('frame-start');
      if (useAppStore.getState().isPlaying) {
        await doFrame();
      }
      performance.mark('frame-end');
      try {
        performance.measure('frame', 'frame-start', 'frame-end');
      } catch (_) {}
      window.stats.end();
      rafId = window.requestAnimationFrame(frame);
    }
    start();
    rafId = window.requestAnimationFrame(frame);
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('resize', forceRedraw);
    window.app = { getState: useAppStore.getState, setState: useAppStore.setState };
    window.desktop.registerListener('menu', handleMenuEvent);
    window.desktop.registerListener('osc', handleOscEvent);
    window.desktop.registerListener('midi', handleMidiEvent);
    window.desktop.registerListener('midiProgramChange', handleMidiProgramChange);
    window.desktop.registerListener('midiDevices', (devices) => useAppStore.getState().setMidiDevices(devices));
    window.desktop.getMidiDevices().then((devices) => useAppStore.getState().setMidiDevices(devices));
    // File opening is deferred to the gpuStatus==='ready' effect above.
    return () => {
      cancelAnimationFrame(rafId);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('resize', forceRedraw);
      window.app = undefined;
    };
  }, [
    doFrame,
    forceRedraw,
    handleMenuEvent,
    handleMidiEvent,
    handleMidiProgramChange,
    handleOscEvent,
    onKeyDown,
    openFile,
    start,
    props.filePath,
  ]);

  if (gpuStatus !== 'ready') {
    return (
      <div className="app flex items-center justify-center h-screen bg-gray-900 text-white">
        <div className="text-center">
          {gpuStatus === 'uninitialized' && <p>Initializing GPU...</p>}
          {gpuStatus === 'unavailable' && <p>WebGPU is not available in this environment.</p>}
          {gpuStatus === 'error' && <p>GPU initialization failed. Please check your GPU drivers.</p>}
          {gpuStatus === 'lost' && (
            <div>
              <p>GPU device lost.</p>
              <button
                className="mt-2 px-4 py-2 bg-blue-600 rounded"
                onClick={() => {
                  figment
                    .initGPU({ powerPreference: 'high-performance' })
                    .then(() => setGpuStatus('ready'))
                    .catch(() => setGpuStatus(figment.getGPUStatus()));
                }}
              >
                Reinitialize GPU
              </button>
            </div>
          )}
        </div>
      </div>
    );
  }

  if (fullscreen) {
    return (
      <div className="app">
        <Viewer />
      </div>
    );
  }

  return (
    <>
      <main ref={mainRef}>
        <Editor />
        <Splitter className="splitter" parentRef={mainRef} direction="horizontal" />
        <ParamsEditor />
      </main>
      {showNodeDialog && <NodeDialog />}
      {showForkDialog && <ForkDialog />}
      {showNodeRenameDialog && <NodeRenameDialog />}
      {showRenderDialog && <RenderDialog />}
      {showProjectSettingsDialog && <ProjectSettingsDialog />}
      {migration && <MigrationDialog />}
    </>
  );
}
