import { h } from 'preact';
import { useState } from 'preact/hooks';
import Dragger from './Dragger.js';

function merge(...args) {
  return Object.assign({}, ...args);
}

export default function ColorPicker({ color, onChange }) {
  console.log('COLORPICKER', useState);
  const [hue, setHue] = useState(0);
  const [saturation, setSaturation] = useState(70);
  const [lightness, setLightness] = useState(70);
  const [alpha, setAlpha] = useState(0.8);
  const outerBackground = {
    background: `linear-gradient(to right, hsl(${hue}, 0%, 100%), hsl(${hue}, 100%, 50%)`
  };
  const swatchBackground = {
    background: `hsla(${hue}, ${saturation}%, ${lightness}%, ${alpha})`
  };

  return (
    <div style={styles.wrapper}>
      <div style={merge(styles.outer, outerBackground)}>
        <div style={styles.inner}></div>
      </div>
      <div style={styles.slidersWrapper}>
        <div style={styles.sliders}>
          <input
            style={styles.hueSlider}
            type="range"
            min={0}
            max={360}
            value={hue}
            onInput={e => setHue(parseInt(e.target.value))}
          />
          <input
            style={styles.alphaSlider}
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={alpha}
            onInput={e => setAlpha(parseFloat(e.target.value))}
          />
        </div>
        <div style={merge(styles.swatch, swatchBackground)}></div>
      </div>
      <div style={styles.valuesWrapper}>
        <Dragger label="H" value={hue} onChange={setHue} min={0} max={255} />
        <Dragger label="S" value={saturation} onChange={setSaturation} min={0} max={255} />
        <Dragger label="L" value={lightness} onChange={setLightness} min={0} max={255} />
        <Dragger label="A" value={alpha} onChange={setAlpha} min={0} max={1} step={0.01} />
      </div>
    </div>
  );
}

const styles = {
  wrapper: { width: '200px' },
  outer: {
    width: '190px',
    height: '140px',
    margin: '5px',
    border: '1px solid rgba(255, 255, 255, 0.2)',
    borderRadius: '3px',
    overflow: 'hidden'
  },
  inner: {
    width: '100%',
    height: '100%',
    background: `linear-gradient(rgba(0, 0, 0, 0), rgba(0, 0, 0, 1.0))`
  },
  slidersWrapper: {
    display: 'flex',
    justifyContent: 'space-between'
  },
  sliders: {
    display: 'flex',
    flexDirection: 'column'
  },
  hueSlider: {
    height: '10px'
  },
  swatch: {
    width: '25px',
    height: '25px',
    'border-radius': '50%',
    border: '1px solid rgba(255, 255, 255, 0.2)'
  },
  valuesWrapper: {
    marginTop: '20px',
    display: 'flex',
    justifyContent: 'space-between'
  }
};
