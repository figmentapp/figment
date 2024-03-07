import React, { Component } from 'react';
import CodeMirror from 'codemirror';
import 'codemirror/mode/javascript/javascript.js';
import 'codemirror/theme/darcula.css';

export default class CodeEditor extends Component {
  constructor(props) {
    super(props);
    this.state = { source: props.nodeType.source };
    //this._onKeyDown = this._onKeyDown.bind(this);
  }

  isReadOnly() {
    const ns = this.props.nodeType.type.split('.')[0];
    const readOnly = ns !== 'project';
    return readOnly;
  }

  componentDidMount() {
    const $code = document.getElementById('code');
    this.editor = CodeMirror.fromTextArea($code, {
      lineNumbers: true,
      readOnly: this.isReadOnly(),
      mode: 'javascript',
      theme: 'darcula',
    });
    const mod = /Mac/.test(navigator.platform) ? 'Cmd' : 'Ctrl';
    this.editor.setOption('extraKeys', {
      [`${mod}-Enter`]: () => {
        try {
          this.props.onChangeSource(this.props.nodeType, this.editor.getValue());
        } catch (e) {
          console.error(e);
        }
        return false;
      },
    });
  }

  componentDidUpdate(prevProps) {
    if (prevProps.nodeType !== this.props.nodeType) {
      this.setState({ source: this.props.nodeType.source });
      this.editor.setValue(this.props.nodeType.source);
      this.editor.setOption('readOnly', this.isReadOnly());
    }
  }

  render() {
    const readOnly = this.isReadOnly();
    return (
      <div className="code flex-1 flex flex-col overflow-hidden">
        <div className={'flex-1 overflow-hidden ' + (readOnly ? 'opacity-50' : '')}>
          <textarea className="code__area" id="code" defaultValue={this.state.source} readOnly={readOnly} />
        </div>
        <div className="code__actions px-4 py-3 flex items-center justify-between bg-gray-900">
          {readOnly && (
            <>
              {' '}
              <span className="text-gray-500">Code is read-only. Fork the code.</span>
              <button
                onClick={() => this.props.onShowForkDialog(this.props.nodeType)}
                className="bg-gray-700 px-4 py-1 rounded text-gray-200"
              >
                Fork
              </button>
            </>
          )}
          {!readOnly && <span className="text-gray-400">{this.props.nodeType.type}</span>}
        </div>
      </div>
    );
  }
}
