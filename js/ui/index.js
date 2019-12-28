import { h, Component, render } from 'preact';
import * as g from '../g';

import App from './App';

window.g = g;
render(<App />, document.getElementById('root'));
