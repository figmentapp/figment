import jexl from 'jexl';

let context = {
  $FRAME: 1,
  $TIME: 0,
  $NOW: 0,
};

export function setExpressionContext(newContext) {
  context = { ...context, ...newContext };
}

export function evalExpression(expr) {
  return jexl.evalSync(expr, context);
}
