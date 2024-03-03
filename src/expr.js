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

export function initExpressionContext(newContext) {
  context = { ...context, ...newContext };
  jexl.addFunction('osc', osc);
}

export function setExpressionContext(newContext) {
  context = { ...context, ...newContext };
}

export function evalExpression(expr) {
  return jexl.evalSync(expr, context);
}
