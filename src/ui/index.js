import { h, Component, render } from 'preact';
import * as g from '../g';
import * as figment from '../figment';

import App from './App';

window.g = g;
window.figment = figment;
render(<App />, document.getElementById('root'));
