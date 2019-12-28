import { h, Component } from 'preact';
import CodeMirror from 'codemirror';
import 'codemirror/mode/javascript/javascript.js';
import 'codemirror/theme/darcula.css';

export default class CodeEditor extends Component {
  constructor(props) {
    super(props);
    this.state = { source: props.node.source };
    //this._onKeyDown = this._onKeyDown.bind(this);
  }

  componentDidUpdate(prevProps) {
    if (prevProps.node !== this.props.node) {
      this.setState({ source: this.props.node.source });
      this.editor.setValue(this.props.node.source);
    }
  }

  componentDidMount() {
    const $code = document.getElementById('code');
    this.editor = CodeMirror.fromTextArea($code, {
      lineNumbers: true,
      mode: 'javascript',
      theme: 'darcula'
    });
    this.editor.setOption('extraKeys', {
      'Cmd-Enter': () => {
        try {
          this.props.onChangeSource(this.props.node, this.editor.getValue());
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
