import React, { Component } from 'react';

export default class Viewer extends Component {
  constructor(props) {
    super(props);
    this.previewCanvasRef = React.createRef();
    this._draw = this._draw.bind(this);
    this._onResize = this._onResize.bind(this);
    this._currentBitmap = null;
  }

  componentDidMount() {
    window.addEventListener('resize', this._onResize);
    this._draw();
  }

  componentWillUnmount() {
    window.removeEventListener('resize', this._onResize);
    if (this._currentBitmap) {
      try {
        this._currentBitmap.close();
      } catch (_) {
        // ignore
      }
      this._currentBitmap = null;
    }
  }

  componentDidUpdate(prevProps) {
    if (prevProps.network !== this.props.network) {
      this._draw();
    }
  }

  render() {
    return (
      <div className="fixed inset-0 overflow-hidden bg-black">
        <canvas ref={this.previewCanvasRef}></canvas>
      </div>
    );
  }

  setFrame(bitmap) {
    if (!bitmap) return;
    if (this._currentBitmap && this._currentBitmap !== bitmap) {
      try {
        this._currentBitmap.close();
      } catch (_) {
        // ignore
      }
    }
    this._currentBitmap = bitmap;
    this._draw();
  }

  _draw() {
    const previewCanvas = this.previewCanvasRef.current;
    if (!previewCanvas) return;
    const parent = previewCanvas.parentElement;
    if (previewCanvas.width !== parent.clientWidth || previewCanvas.height !== parent.clientHeight) {
      previewCanvas.width = parent.clientWidth;
      previewCanvas.height = parent.clientHeight;
    }

    const ctx = previewCanvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, previewCanvas.width, previewCanvas.height);

    if (!this._currentBitmap) {
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, previewCanvas.width, previewCanvas.height);
      return;
    }

    const bitmapWidth = this._currentBitmap.width;
    const bitmapHeight = this._currentBitmap.height;
    const scale = Math.min(previewCanvas.width / bitmapWidth, previewCanvas.height / bitmapHeight);
    const drawWidth = bitmapWidth * scale;
    const drawHeight = bitmapHeight * scale;
    const offsetX = (previewCanvas.width - drawWidth) / 2;
    const offsetY = (previewCanvas.height - drawHeight) / 2;
    ctx.drawImage(this._currentBitmap, offsetX, offsetY, drawWidth, drawHeight);
  }

  _onResize() {
    this._draw();
  }
}
