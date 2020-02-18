import { h, Component } from 'preact';

export default class Viewer extends Component {
  constructor(props) {
    super(props);
  }

  render({ fullscreen, onToggleFullscreen }) {
    let iconClass = 'fas fa-expand cursor-pointer ';
    iconClass += fullscreen ? 'text-gray-800' : 'text-gray-600';
    return (
      <div class="flex flex-col flex-1">
        <div class="p-5 bg-gray-900 flex justify-end">
          <i class={iconClass} onClick={onToggleFullscreen}></i>
        </div>
        <div class="flex flex-1 justify-center items-center">
          <div id="viewer"></div>
        </div>
      </div>
    );
  }
}
