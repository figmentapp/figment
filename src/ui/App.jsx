import React, { useState, useEffect, useRef } from 'react';
import Stats from 'three/examples/jsm/libs/stats.module';
import Network, { getDefaultNetwork } from '../model/Network';
import { Point } from '../g';
import { PORT_TYPE_IMAGE } from '../model/Port';
import Editor from './Editor';
import Viewer from './Viewer';
import ParamsEditor from './ParamsEditor';
import NodeDialog from './NodeDialog';
import Splitter from './Splitter';
import Library from '../model/Library';
import ForkDialog from './ForkDialog';
import NodeRenameDialog from './NodeRenameDialog';
import RenderDialog from './RenderDialog';
import ProjectSettingsDialog from './ProjectSettingsDialog';
import { upgradeProject } from '../file-format';
import { initExpressionContext } from '../expr';

function randInt(min, max) {
  return Math.floor(min + Math.random() * (max - min));
}

window.stats = new Stats();
window.stats.dom.style.top = '';
window.stats.dom.style.bottom = '0';

const App = (props) => {
  const [filePath, setFilePath] = useState(props.filePath);
  const [dirty, setDirty] = useState(false);
  const [library] = useState(new Library());
  const [network, setNetwork] = useState(() => {
    const net = new Network(library);
    net.parse(getDefaultNetwork());
    return net;
  });
  const [tabs, setTabs] = useState([]);
  const [activeTabIndex, setActiveTabIndex] = useState(-1);
  const [selection, setSelection] = useState(new Set());
  const [showNodeDialog, setShowNodeDialog] = useState(false);
  const [showForkDialog, setShowForkDialog] = useState(false);
  const [showRenderDialog, setShowRenderDialog] = useState(false);
  const [showProjectSettingsDialog, setShowProjectSettingsDialog] = useState(false);
  const [forkDialogNodeType, setForkDialogNodeType] = useState(null);
  const [lastNetworkPoint, setLastNetworkPoint] = useState(new Point(0, 0));
  const [editorSplitterWidth, setEditorSplitterWidth] = useState(350);
  const [fullscreen, setFullscreen] = useState(false);
  const [version, setVersion] = useState(1);
  const [isPlaying, setIsPlaying] = useState(true);
  const [oscServerPort, setOscServerPort] = useState(null);
  const [oscMessageFrequencies, setOscMessageFrequencies] = useState([]);
  const oscMessageMap = useRef(new Map());
  const mainRef = useRef();
  const offscreenCanvas = useRef(new OffscreenCanvas(256, 256));

  useEffect(() => {
    initExpressionContext({ _osc: oscMessageMap.current });
    const firstNode = network.nodes[0];
    if (firstNode) {
      setSelection(new Set([firstNode]));
    }
    const handleKeyDown = (e) => {
      if (e.keyCode === 27 && fullscreen) {
        toggleFullscreen();
      }
    };
    const forceRedraw = () => {
      setVersion(v => v + 1);
    };
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('resize', forceRedraw);
    window.app = this;
    window.desktop.registerListener('menu', handleMenuEvent);
    window.desktop.registerListener('osc', handleOscEvent);
    if (filePath) {
      openFile(filePath);
    }
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('resize', forceRedraw);
      window.app = undefined;
    };
  }, []);

  const handleMenuEvent = (name, args) => {
    // Menu event handling logic
  };

  const handleOscEvent = (name, args) => {
    // OSC event handling logic
  };

  const openFile = async (filePath) => {
    // File opening logic
  };

  const saveFile = async (filePath) => {
    // File saving logic
  };

  const toggleFullscreen = () => {
    setFullscreen(!fullscreen);
    window.desktop.setFullScreen(!fullscreen);
    if (!fullscreen) {
      document.documentElement.classList.add('hide-cursor');
    } else {
      document.documentElement.classList.remove('hide-cursor');
    }
  };

  // Other component logic...

  return (
    <>
      <main ref={mainRef}>
        {/* Main content rendering */}
      </main>
      {/* Conditional rendering of dialogs */}
    </>
  );
};

export default App;
