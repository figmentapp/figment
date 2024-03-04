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

export function initExpressionContext(newContext) {
  context = { ...context, ...newContext };
  jexl.addFunction('osc', osc);
  jexl.addFunction('map', map);
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
