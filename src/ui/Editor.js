import { h, Component } from 'preact';

import NetworkEditor from './NetworkEditor';
import CodeEditor from './CodeEditor';

export default class Editor extends Component {
  _onCloseTab(e, index) {
    e.stopPropagation();
    this.props.onCloseTab(index);
  }

  render({
    network,
    selection,
    tabs,
    activeTabIndex,
    onNewCodeTab,
    onSelectTab,
    onCloseTab,
    onSelectNode,
    onClearSelection,
    onDeleteSelection,
    onShowNodeDialog,
    onConnect,
    onDisconnect,
    onChangeSource,
    onShowForkDialog,
    style
  }) {
    return (
      <div class="editor" style={style}>
        <div class="editor__tabs">
          <div
            class={'editor__tab' + (activeTabIndex === -1 ? ' editor__tab--active' : '')}
            onClick={() => onSelectTab(-1)}
          >
            Network
          </div>
          {tabs.map((node, i) => (
            <div
              class={'editor__tab' + (activeTabIndex === i ? ' editor__tab--active' : '')}
              onClick={() => onSelectTab(i)}
            >
              <span class="editor__tab-name">{node.name}</span>
              <a class="editor__tab-close" onClick={e => this._onCloseTab(e, i)}>
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
            onClearSelection={onClearSelection}
            onDeleteSelection={onDeleteSelection}
            onNewCodeTab={onNewCodeTab}
            onShowNodeDialog={onShowNodeDialog}
            onConnect={onConnect}
            onDisconnect={onDisconnect}
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
