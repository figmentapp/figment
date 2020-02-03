import { h, Component } from 'preact';

import NetworkEditor from './NetworkEditor';
import CodeEditor from './CodeEditor';

export default class Editor extends Component {
  constructor(props) {
    super(props);
    this.state = { tabs: [], activeTabIndex: -1 };
    this._addTab = this._addTab.bind(this);
    this._onSelectTab = this._onSelectTab.bind(this);
    this._onOpenCode = this._onOpenCode.bind(this);
  }

  _addTab(nodeType) {
    const { tabs } = this.state;
    tabs.push(nodeType);
    this.setState({ tabs });
  }

  _onOpenCode(node) {
    const nodeType = this.props.network.findNodeType(node.type);
    if (this.state.tabs.includes(nodeType)) {
      this.setState({ activeTabIndex: this.state.tabs.indexOf(nodeType) });
      return;
    }
    this._addTab(nodeType);
    this.setState({ activeTabIndex: this.state.tabs.length - 1 });
  }

  _onSelectTab(index) {
    this.setState({ activeTabIndex: index });
  }

  _onCloseTab(e, index) {
    e.stopPropagation();
    const { tabs } = this.state;
    tabs.splice(index, 1);
    this.setState({ tabs, activeTabIndex: tabs.length - 1 });
  }

  render(
    {
      network,
      selection,
      onSelectNode,
      onClearSelection,
      onDeleteSelection,
      onShowNodeDialog,
      onConnect,
      onDisconnect,
      onChangeSource,
      onShowForkDialog,
      style
    },
    { tabs, activeTabIndex }
  ) {
    return (
      <div class="editor" style={style}>
        <div class="editor__tabs">
          <div
            class={'editor__tab' + (activeTabIndex === -1 ? ' editor__tab--active' : '')}
            onClick={() => this._onSelectTab(-1)}
          >
            Network
          </div>
          {tabs.map((node, i) => (
            <div
              class={'editor__tab' + (activeTabIndex === i ? ' editor__tab--active' : '')}
              onClick={() => this._onSelectTab(i)}
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
            onOpenCode={this._onOpenCode}
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
