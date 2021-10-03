import React, { Component } from 'react';

import NetworkEditor from './NetworkEditor';
import CodeEditor from './CodeEditor';

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
      onChangeSource,
      onShowForkDialog,
      style,
    } = this.props;
    return (
      <div className="editor" style={style}>
        <div className="editor__tabs">
          <div
            className={'editor__tab' + (activeTabIndex === -1 ? ' editor__tab--active' : '')}
            onClick={() => onSelectTab(-1)}
          >
            Network
          </div>
          {tabs.map((node, i) => (
            <div
              key={i}
              className={'editor__tab' + (activeTabIndex === i ? ' editor__tab--active' : '')}
              onClick={() => onSelectTab(i)}
            >
              <span className="editor__tab-name">{node.name}</span>
              <a className="editor__tab-close" onClick={(e) => this._onCloseTab(e, i)}>
                <svg viewBox="0 0 16 16" width="16" height="16">
                  <path d="M4 4L12 12M12 4L4 12" />
                </svg>
              </a>
            </div>
          ))}
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
            nodeType={tabs[activeTabIndex]}
            onChangeSource={onChangeSource}
            onShowForkDialog={onShowForkDialog}
          />
        )}
      </div>
    );
  }
}
