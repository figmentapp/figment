import { h, Component } from 'preact';
import CodeMirror from 'codemirror';

export default class CodeEditor extends Component {
  constructor(props) {
    super(props);
    this.state = { source: props.nodeType.source };
    //this._onKeyDown = this._onKeyDown.bind(this);
  }

  componentDidUpdate(prevProps) {
    if (prevProps.nodeType !== this.props.nodeType) {
      this.setState({ source: this.props.nodeType.source });
      this.editor.setValue(this.props.nodeType.source);
    }
  }

  componentDidMount() {
    const $code = document.getElementById('code');
    this.editor = CodeMirror.fromTextArea($code, {
      lineNumbers: true,
      mode: 'javascript',
      theme: 'darcula'
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
      }
    });
  }

  render() {
    return (
      <div class="code">
        <textarea class="code__area" id="code" value={this.state.source} />
      </div>
    );
  }
}
