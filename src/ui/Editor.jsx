import React, { Component } from 'react';

import NetworkEditor from './NetworkEditor';
import CodeEditor from './CodeEditor';
import OscWidget from './OscWidget';

export default class Editor extends Component {
  _onCloseTab(e, index) {
    e.stopPropagation();
    this.props.onCloseTab(index);
  }

  render() {
    const {
      network,
      selection,
      tabs,
      activeTabIndex,
      onNewCodeTab,
      onSelectTab,
      onCloseTab,
      onSelectNode,
      onToggleSelectNode,
      onSelectNodes,
      onClearSelection,
      onDeleteSelection,
      onShowNodeDialog,
      onConnect,
      onDisconnect,
      onSourceModified,
      onBuildSource,
      onShowForkDialog,
      style,
      oscServerPort,
      oscMessageFrequencies,
      onClickOsc,
    } = this.props;
    return (
      <div className="editor" style={style}>
        <div className="editor__tabs">
          <div className={'editor__tab' + (activeTabIndex === -1 ? ' editor__tab--active' : '')} onClick={() => onSelectTab(-1)}>
            Network
          </div>
          {tabs.map(({ nodeType, modified }, i) => (
            <div key={i} className={'editor__tab' + (activeTabIndex === i ? ' editor__tab--active' : '')} onClick={() => onSelectTab(i)}>
              <span className="editor__tab-name">{nodeType.name}</span>
              <a className={modified ? 'editor__tab-modified' : 'editor__tab-close'} onClick={(e) => this._onCloseTab(e, i)}>
                <svg viewBox="0 0 16 16" width="16" height="16">
                  {!modified && <path d="M4 4L12 12M12 4L4 12" />}
                  {modified && (
                    <path d="M10 5C10 7.76142 7.76142 10 5 10C2.23858 10 0 7.76142 0 5C0 2.23858 2.23858 0 5 0C7.76142 0 10 2.23858 10 5Z" />
                  )}
                </svg>
              </a>
            </div>
          ))}
          <span className="flex-1"></span>
          <OscWidget port={oscServerPort} frequencies={oscMessageFrequencies} onClick={onClickOsc} />
        </div>
        {activeTabIndex === -1 && (
          <NetworkEditor
            network={network}
            selection={selection}
            onSelectNode={onSelectNode}
            onToggleSelectNode={onToggleSelectNode}
            onSelectNodes={onSelectNodes}
            onClearSelection={onClearSelection}
            onDeleteSelection={onDeleteSelection}
            onNewCodeTab={onNewCodeTab}
            onShowNodeDialog={onShowNodeDialog}
            onConnect={onConnect}
            onDisconnect={onDisconnect}
            offscreenCanvas={this.props.offscreenCanvas}
          />
        )}
        {activeTabIndex >= 0 && (
          <CodeEditor
            nodeType={tabs[activeTabIndex].nodeType}
            modified={tabs[activeTabIndex].modified}
            onSourceModified={onSourceModified}
            onBuildSource={onBuildSource}
            onShowForkDialog={onShowForkDialog}
          />
        )}
      </div>
    );
  }
}
