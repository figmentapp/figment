import React from 'react';
import ReactDOM from 'react-dom';
import { WebGLRenderer } from 'three';
import * as g from '../g';
import * as figment from '../figment';
import * as THREE from 'three';
import * as tf from '@tensorflow/tfjs';

import App from './App';

window.g = g;
window.THREE = THREE;
window.figment = figment;
window.tf = tf;
ReactDOM.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
  document.getElementById('root')
);
