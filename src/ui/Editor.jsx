import React from 'react';

import NetworkEditor from './NetworkEditor';
import CodeEditor from './CodeEditor';
import OscWidget from './OscWidget';
import { useAppStore } from './store';

export default function Editor({ style }) {
  const tabs = useAppStore((state) => state.tabs);
  const activeTabIndex = useAppStore((state) => state.activeTabIndex);
  const oscServerPort = useAppStore((state) => state.oscServerPort);
  const oscMessageFrequencies = useAppStore((state) => state.oscMessageFrequencies);

  const selectTab = useAppStore((state) => state.selectTab);
  const closeTab = useAppStore((state) => state.closeTab);
  const openProjectSettingsDialog = useAppStore((state) => state.openProjectSettingsDialog);

  const handleCloseTab = (e, index) => {
    e.stopPropagation();
    closeTab(index);
  };

  return (
    <div className="editor" style={style}>
      <div className="editor__tabs">
        <div className={'editor__tab' + (activeTabIndex === -1 ? ' editor__tab--active' : '')} onClick={() => selectTab(-1)}>
          Network
        </div>
        {tabs.map(({ nodeType, modified }, i) => (
          <div key={i} className={'editor__tab' + (activeTabIndex === i ? ' editor__tab--active' : '')} onClick={() => selectTab(i)}>
            <span className="editor__tab-name">{nodeType.name}</span>
            <a className={modified ? 'editor__tab-modified' : 'editor__tab-close'} onClick={(e) => handleCloseTab(e, i)}>
              <svg viewBox="0 0 16 16" width="16" height="16">
                {!modified && <path d="M4 4L12 12M12 4L4 12" />}
                {modified && <circle cx={6} cy={6} r={5} fill="white" />}
              </svg>
            </a>
          </div>
        ))}
        <span className="flex-1"></span>
        <OscWidget port={oscServerPort} frequencies={oscMessageFrequencies} onClick={openProjectSettingsDialog} />
      </div>
      {activeTabIndex === -1 && <NetworkEditor />}
      {activeTabIndex >= 0 && <CodeEditor />}
    </div>
  );
}
