import { h } from 'preact';
import { useState } from 'preact/hooks';
import chroma from 'chroma-js';
import Dragger from './Dragger.js';
import { COLORS } from '../colors';

function merge(...args) {
  return Object.assign({}, ...args);
}

export default function ColorPicker({ color, onChange }) {
  let [hue, saturation, lightness, alpha] = chroma.rgb(color).hsl();
  console.log('IN', hue, saturation, lightness, alpha);
  const outerBackground = {
    background: `linear-gradient(to right, hsl(${hue}, 0%, 100%), hsl(${hue}, 100%, 50%)`
  };
  const swatchBackground = {
    background: `hsla(${hue}, ${saturation * 100}%, ${lightness * 100}%, ${alpha})`
  };
  const x = saturation * 190;
  const y = (1 - lightness) * 140;
  const dotPosition = {
    left: `${x - 6}px`,
    top: `${y - 6}px`
  };

  function setHue(newHue) {
    onChange(chroma(newHue, saturation, lightness, alpha).rgb());
  }

  function setSaturation(newSaturation) {
    newSaturation /= 100;
    onChange(chroma(hue, newSaturation, lightness, alpha).rgb());
  }

  function setLightness(newLightness) {
    newLightness /= 100;
    onChange(chroma(hue, saturation, newLightness, alpha).rgb());
  }

  function setAlpha(newAlpha) {
    onChange(chroma(hue, saturation, lightness, newAlpha).rgb());
  }

  function onMouseDown(e) {
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  }

  function onMouseMove(e) {
    const newSaturation = saturation + (e.movementX / 190) * 190;
    const newLightness = lightness + (-e.movementY / 140) * 140;
    //const rgba = chroma(hue, newSaturation, lightness, alpha).rgb();
    //console.log(rgba);
    onChange(chroma(hue, newSaturation, newLightness, alpha).rgb());
    //console.log(e.movementX);
  }

  function onMouseUp(e) {
    window.removeEventListener('mousemove', onMouseMove);
    window.removeEventListener('mouseup', onMouseUp);
  }

  return (
    <div class="color-picker" style={styles.wrapper}>
      <div style={merge(styles.outer, outerBackground)} onMouseDown={onMouseDown}>
        <div style={styles.inner}></div>
        <div style={merge(styles.dot, dotPosition)} />
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
        <Dragger label="H" value={hue} onChange={setHue} min={0} max={360} />
        <Dragger label="S" value={saturation * 100} onChange={setSaturation} min={0} max={100} />
        <Dragger label="L" value={lightness * 100} onChange={setLightness} min={0} max={100} />
        <Dragger label="A" value={alpha} onChange={setAlpha} min={0} max={1} step={0.01} />
      </div>
    </div>
  );
}

const styles = {
  wrapper: {
    width: '200px',
    background: COLORS.gray800,
    boxShadow: '0 5px 5px rgba(0, 0, 0, 0.5)',
    borderRadius: '5px',
    overflow: 'hidden',
    paddingBottom: '5px'
  },
  outer: {
    width: '190px',
    height: '140px',
    margin: '5px',
    borderRadius: '3px',
    overflow: 'hidden',
    position: 'relative'
  },
  inner: {
    width: '100%',
    height: '100%',
    background: `linear-gradient(rgba(0, 0, 0, 0), rgba(0, 0, 0, 1.0))`
  },
  dot: {
    position: 'absolute',
    borderRadius: '50%',
    border: '2px solid rgba(255, 255, 255, 0.9)',
    width: '10px',
    height: '10px'
  },
  slidersWrapper: {
    display: 'flex',
    justifyContent: 'space-between'
  },
  sliders: {
    display: 'flex',
    flexDirection: 'column',
    marginLeft: '5px'
  },
  hueSlider: {
    height: '10px'
  },
  swatch: {
    width: '25px',
    height: '25px',
    borderRadius: '50%',
    border: '1px solid rgba(255, 255, 255, 0.2)',
    marginRight: '5px'
  },
  valuesWrapper: {
    marginTop: '10px',
    marginLeft: '5px',
    marginRight: '5px',
    display: 'flex',
    justifyContent: 'space-between'
  }
};
