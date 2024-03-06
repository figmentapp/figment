import jexl from 'jexl';

let context = {
  $FRAME: 1,
  $TIME: 0,
  $NOW: 0,
  _osc: new Map(),
  osc: (address, defaultValue = 0) => {
    const osc = context._osc.get(address);
    return osc ? osc : defaultValue;
  },
};

function osc(address, defaultValue = 0) {
  return context._osc.get(address) || defaultValue;
}

function map(v, inMin, inMax, outMin, outMax, clamp = false) {
  if (clamp) {
    v = Math.min(Math.max(v, inMin), inMax);
  }
  return ((v - inMin) / (inMax - inMin)) * (outMax - outMin) + outMin;
}

function pingPong(min, max, period = 1, type = 'smooth', time = undefined) {
  if (time === undefined) {
    time = context.$TIME;
  }
  let value = 0;
  const t = (time % period) / period; // Normalizes time to a 0-1 range based on the period
  switch (type) {
    case 'linear':
      value = Math.abs(t * 2 - 1);
      break;
    case 'smooth':
      // Sine wave for smooth, periodic oscillations
      value = (Math.sin(t * 2 * Math.PI) + 1) / 2;
      break;
    case 'step':
      // Square wave for abrupt changes
      value = t < 0.5 ? 0 : 1;
      break;
    default:
      console.warn("Unsupported type. Defaulting to 'linear'.");
      value = Math.abs(t * 2 - 1);
  }
  return min + value * (max - min);
}

function random(min, max, seed) {}

export function initExpressionContext(newContext) {
  context = { ...context, ...newContext };
  // Basic math functions
  jexl.addFunction('abs', Math.abs);
  jexl.addFunction('pow', Math.pow);
  jexl.addFunction('sqrt', Math.sqrt);
  // Periodic functions
  jexl.addFunction('sin', Math.sin);
  jexl.addFunction('cos', Math.cos);
  jexl.addFunction('tan', Math.tan);
  // Easing functions
  // FIXME: Add easing functions
  jexl.addFunction('pingPong', pingPong);
  // Random functions
  jexl.addFunction('random', Math.random);
  // Utility functions
  jexl.addFunction('clamp', (v, min, max) => Math.min(Math.max(v, min), max));
  jexl.addFunction('lerp', (a, b, t) => a + (b - a) * t);
  jexl.addFunction('map', map);
  // Open Sound Control
  jexl.addFunction('osc', osc);
}

export function setExpressionContext(newContext) {
  context = { ...context, ...newContext };
}

// Jexl can't deal with unary "-" operators. This function replaces this with a binary operator.
// It's ridiculous, but it works.
// So an expression like this will fail: add(1, -1)
// We replace it with: add(1, 0-1)
// We don't do full tokenization, we just use regular expressions to fix common cases.
function fixupExpression(expr) {
  return expr.replace(/,\s*-/g, ', 0-');
}

export function evalExpression(expr) {
  expr = fixupExpression(expr);
  return jexl.evalSync(expr, context);
}
