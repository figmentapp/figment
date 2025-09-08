import React, { useCallback, useEffect, useRef } from 'react'
import Stats from 'three/examples/jsm/libs/stats.module'
import Editor from './Editor'
import Viewer from './Viewer'
import ParamsEditor from './ParamsEditor'
import NodeDialog from './NodeDialog'
import Splitter from './Splitter'
import ForkDialog from './ForkDialog'
import NodeRenameDialog from './NodeRenameDialog'
import RenderDialog from './RenderDialog'
import ProjectSettingsDialog from './ProjectSettingsDialog'
import { initExpressionContext } from '../expr'
import { useAppStore } from './store'

window.stats = new Stats()
window.stats.dom.style.top = ''
window.stats.dom.style.bottom = '0'

export default function App(props) {
  const mainRef = useRef(null)
  const offscreenCanvasRef = useRef(new OffscreenCanvas(256, 256))

  const {
    // state
    library,
    network,
    tabs,
    activeTabIndex,
    selection,
    showNodeDialog,
    showForkDialog,
    showRenderDialog,
    showProjectSettingsDialog,
    showNodeRenameDialog,
    nodeToRename,
    forkDialogNodeType,
    editorSplitterWidth,
    fullscreen,
    oscServerPort,
    oscMessageFrequencies,
    // actions
    startNetwork,
    start,
    doFrame,
    forceRedraw,
    toggleFullscreen,
    handleMenuEvent,
    handleOscEvent,
    handleMidiEvent,
    openFile,
    // tabs & selection
    newCodeTab,
    selectTab,
    closeTab,
    selectNode,
    toggleSelectNode,
    selectNodes,
    clearSelection,
    deleteSelection,
    // node source/ports
    sourceModified,
    buildSource,
    changePortValue,
    changePortExpression,
    revertPortValue,
    triggerButton,
    // dialogs & nodes
    openNodeDialog,
    closeNodeDialog,
    openForkDialog,
    closeForkDialog,
    forkNodeType,
    closeRenderDialog,
    openProjectSettingsDialog,
    closeProjectSettingsDialog,
    createNode,
    openNodeRenameDialog,
    closeNodeRenameDialog,
    renameNode,
    connect,
    disconnect,
    renderSequence,
    changeProjectSetting,
  } = useAppStore()

  useEffect(() => {
    window.gl = offscreenCanvasRef.current.getContext('webgl')
  }, [])

  // One-time: expression context for OSC/MIDI
  useEffect(() => {
    const { oscMessageMap, midiMessageMap } = useAppStore.getState()
    initExpressionContext({ _osc: oscMessageMap, _midi: midiMessageMap })
  }, [])

  // Ensure network has started
  useEffect(() => {
    startNetwork()
  }, [startNetwork])

  const onKeyDown = useCallback((e) => {
    if (e.keyCode === 27 && useAppStore.getState().fullscreen) toggleFullscreen()
  }, [toggleFullscreen])

  // Wire listeners and RAF loop explicitly here
  useEffect(() => {
    async function frame() {
      window.stats.begin()
      if (useAppStore.getState().isPlaying) {
        await doFrame()
      }
      window.stats.end()
      window.requestAnimationFrame(frame)
    }
    start()
    window.requestAnimationFrame(frame)
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('resize', forceRedraw)
    window.app = { getState: useAppStore.getState, setState: useAppStore.setState }
    window.desktop.registerListener('menu', handleMenuEvent)
    window.desktop.registerListener('osc', handleOscEvent)
    window.desktop.registerListener('midi', handleMidiEvent)
    const initialPath = props.filePath || useAppStore.getState().filePath
    if (initialPath) openFile(initialPath)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('resize', forceRedraw)
      window.app = undefined
    }
  }, [doFrame, forceRedraw, handleMenuEvent, handleMidiEvent, handleOscEvent, onKeyDown, openFile, start, props.filePath])

  if (fullscreen) {
    return (
      <div className="app">
        <Viewer network={network} offscreenCanvas={offscreenCanvasRef.current} fullscreen={fullscreen} onToggleFullscreen={toggleFullscreen} />
      </div>
    )
  }

  return (
    <>
      <main ref={mainRef}>
        <Editor
          tabs={tabs}
          activeTabIndex={activeTabIndex}
          library={library}
          network={network}
          selection={selection}
          onNewCodeTab={newCodeTab}
          onSelectTab={selectTab}
          onCloseTab={closeTab}
          onSelectNode={selectNode}
          onToggleSelectNode={toggleSelectNode}
          onSelectNodes={selectNodes}
          onClearSelection={clearSelection}
          onDeleteSelection={deleteSelection}
          onSourceModified={sourceModified}
          onBuildSource={buildSource}
          onShowNodeDialog={openNodeDialog}
          onShowForkDialog={openForkDialog}
          onConnect={connect}
          onDisconnect={disconnect}
          offscreenCanvas={offscreenCanvasRef.current}
          oscServerPort={oscServerPort}
          oscMessageFrequencies={oscMessageFrequencies}
          onClickOsc={openProjectSettingsDialog}
        />
        <Splitter className="splitter" parentRef={mainRef} direction="horizontal" />

        <ParamsEditor
          network={network}
          selection={selection}
          onShowNodeRenameDialog={openNodeRenameDialog}
          onChangePortValue={changePortValue}
          _onChangePortExpression={changePortExpression}
          onRevertPortValue={revertPortValue}
          onTriggerButton={triggerButton}
          editorSplitterWidth={editorSplitterWidth}
        />
      </main>
      {showNodeDialog && <NodeDialog network={network} onCreateNode={createNode} onCancel={closeNodeDialog} />}
      {showForkDialog && (
        <ForkDialog
          network={network}
          selection={selection}
          nodeType={forkDialogNodeType}
          onForkNodeType={forkNodeType}
          onCancel={closeForkDialog}
        />
      )}
      {showNodeRenameDialog && <NodeRenameDialog node={nodeToRename} onRenameNode={renameNode} onCancel={closeNodeRenameDialog} />}
      {showRenderDialog && <RenderDialog network={network} renderSequence={renderSequence} onCancel={closeRenderDialog} />}
      {showProjectSettingsDialog && (
        <ProjectSettingsDialog network={network} onChange={changeProjectSetting} onCancel={closeProjectSettingsDialog} />
      )}
    </>
  )
}

