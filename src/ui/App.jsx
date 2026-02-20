import React, { useCallback, useEffect, useRef } from 'react';
import Stats from 'three/examples/jsm/libs/stats.module';
import Editor from './Editor';
import Viewer from './Viewer';
import ParamsEditor from './ParamsEditor';
import NodeDialog from './NodeDialog';
import Splitter from './Splitter';
import ForkDialog from './ForkDialog';
import NodeRenameDialog from './NodeRenameDialog';
import RenderDialog from './RenderDialog';
import ProjectSettingsDialog from './ProjectSettingsDialog';
import { initExpressionContext } from '../expr';
import { useAppStore } from './store';

window.stats = new Stats();
window.stats.dom.style.top = '';
window.stats.dom.style.bottom = '0';

export default function App(props) {
  const mainRef = useRef(null);
  const offscreenCanvasRef = useRef(new OffscreenCanvas(256, 256));

  // Selectively subscribe to only the state we need
  const fullscreen = useAppStore((state) => state.fullscreen);
  const showNodeDialog = useAppStore((state) => state.showNodeDialog);
  const showForkDialog = useAppStore((state) => state.showForkDialog);
  const showRenderDialog = useAppStore((state) => state.showRenderDialog);
  const showProjectSettingsDialog = useAppStore((state) => state.showProjectSettingsDialog);
  const showNodeRenameDialog = useAppStore((state) => state.showNodeRenameDialog);

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
    window.gl = offscreenCanvasRef.current.getContext('webgl');
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

  // Ensure network has started
  useEffect(() => {
    startNetwork();
  }, [startNetwork]);

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
    async function frame() {
      window.stats.begin();
      if (useAppStore.getState().isPlaying) {
        await doFrame();
      }
      window.stats.end();
      window.requestAnimationFrame(frame);
    }
    start();
    window.requestAnimationFrame(frame);
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('resize', forceRedraw);
    window.app = { getState: useAppStore.getState, setState: useAppStore.setState };
    window.desktop.registerListener('menu', handleMenuEvent);
    window.desktop.registerListener('osc', handleOscEvent);
    window.desktop.registerListener('midi', handleMidiEvent);
    window.desktop.registerListener('midiProgramChange', handleMidiProgramChange);
    window.desktop.registerListener('midiDevices', (devices) => useAppStore.getState().setMidiDevices(devices));
    window.desktop.getMidiDevices().then((devices) => useAppStore.getState().setMidiDevices(devices));
    const initialPath = props.filePath || useAppStore.getState().filePath;
    if (initialPath) openFile(initialPath);
    return () => {
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

  if (fullscreen) {
    return (
      <div className="app">
        <Viewer offscreenCanvas={offscreenCanvasRef.current} />
      </div>
    );
  }

  return (
    <>
      <main ref={mainRef}>
        <Editor offscreenCanvas={offscreenCanvasRef.current} />
        <Splitter className="splitter" parentRef={mainRef} direction="horizontal" />
        <ParamsEditor />
      </main>
      {showNodeDialog && <NodeDialog />}
      {showForkDialog && <ForkDialog />}
      {showNodeRenameDialog && <NodeRenameDialog />}
      {showRenderDialog && <RenderDialog />}
      {showProjectSettingsDialog && <ProjectSettingsDialog />}
    </>
  );
}
