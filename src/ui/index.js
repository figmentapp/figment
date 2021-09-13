import { h, Component, render } from 'preact';
import { WebGLRenderer } from 'three';
import * as g from '../g';
import * as figment from '../figment';
import * as THREE from 'three';

import App from './App';

window.g = g;
window.THREE = THREE;
window.figment = figment;
window.gRenderer = new WebGLRenderer();
render(<App />, document.getElementById('root'));
