import { describe, test, expect, beforeEach } from 'vitest';
import { initExpressionContext, setExpressionContext, evalExpression } from './expr';
import jexl from 'jexl';

describe('Expression evaluation', () => {
  beforeEach(() => {
    // Reset the context before each test
    initExpressionContext({
      $FRAME: 1,
      $TIME: 0,
      $NOW: 0,
      _osc: new Map(),
      _midi: new Map(),
      _bands: new Map(),
    });
  });

  test('basic math operations', () => {
    expect(evalExpression('2 + 2')).toBe(4);
    expect(evalExpression('10 - 5')).toBe(5);
    expect(evalExpression('3 * 4')).toBe(12);
    expect(evalExpression('12 / 3')).toBe(4);
  });

  test('math functions', () => {
    expect(evalExpression('abs(-5)')).toBe(5);
    expect(evalExpression('pow(2, 3)')).toBe(8);
    expect(evalExpression('sqrt(16)')).toBe(4);
  });

  test('trigonometric functions', () => {
    expect(evalExpression('sin(0)')).toBe(0);
    expect(evalExpression('cos(0)')).toBe(1);
    expect(evalExpression('tan(0)')).toBe(0);
  });

  test('utility functions', () => {
    expect(evalExpression('clamp(5, 0, 10)')).toBe(5);
    expect(evalExpression('clamp(-5, 0, 10)')).toBe(0);
    expect(evalExpression('clamp(15, 0, 10)')).toBe(10);

    expect(evalExpression('lerp(0, 10, 0.5)')).toBe(5);

    expect(evalExpression('map(5, 0, 10, 0, 100)')).toBe(50);
    expect(evalExpression('map(5, 0, 10, 0, 100, true)')).toBe(50);
  });

  test('pingPong linear function', () => {
    setExpressionContext({ $TIME: 0 });
    expect(evalExpression('pingPong(0, 10, 1, "linear")')).toBe(0);

    setExpressionContext({ $TIME: 0.5 });
    expect(evalExpression('pingPong(0, 10, 1, "linear")')).toBe(10);

    setExpressionContext({ $TIME: 1 });
    expect(evalExpression('pingPong(0, 10, 1, "linear")')).toBe(0);
  });

  test('pingPong smooth function', () => {
    setExpressionContext({ $TIME: 0 });
    expect(evalExpression('pingPong(0, 10, 1, "smooth")')).toBeCloseTo(5, 5);

    setExpressionContext({ $TIME: 0.25 });
    expect(evalExpression('pingPong(0, 10, 1, "smooth")')).toBeCloseTo(10, 5);

    setExpressionContext({ $TIME: 0.75 });
    expect(evalExpression('pingPong(0, 10, 1, "smooth")')).toBeCloseTo(0, 5);
  });

  test('pingPong step function', () => {
    setExpressionContext({ $TIME: 0 });
    expect(evalExpression('pingPong(0, 10, 1, "step")')).toBe(0);

    setExpressionContext({ $TIME: 0.49 });
    expect(evalExpression('pingPong(0, 10, 1, "step")')).toBe(0);

    setExpressionContext({ $TIME: 0.5 });
    expect(evalExpression('pingPong(0, 10, 1, "step")')).toBe(10);

    setExpressionContext({ $TIME: 1 });
    expect(evalExpression('pingPong(0, 10, 1, "step")')).toBe(0);
  });

  test('OSC functions', () => {
    const oscMap = new Map();
    oscMap.set('/test', 42);
    setExpressionContext({ _osc: oscMap });

    expect(evalExpression('osc("/test")')).toBe(42);
    expect(evalExpression('osc("/nonexistent", 100)')).toBe(100);
  });

  test('MIDI functions', () => {
    const midiMap = new Map();
    midiMap.set('1-64', 127);
    setExpressionContext({ _midi: midiMap });

    expect(evalExpression('midi(1, 64)')).toBe(127);
    expect(evalExpression('midi(2, 64, 0)')).toBe(0);
  });

  test('band functions', () => {
    const bandsMap = new Map();
    bandsMap.set(0, 0.5);
    bandsMap.set(1, 0.7);
    setExpressionContext({ _bands: bandsMap });

    expect(evalExpression('band(0)')).toBe(0.5);
    expect(evalExpression('band(1)')).toBe(0.7);
    expect(evalExpression('bands()')).toEqual([0.5, 0.7]);
  });

  test('fixupExpression handles negative numbers', () => {
    expect(evalExpression('2 + -2')).toBe(0);
    expect(evalExpression('pow(2, -2)')).toBe(0.25);
  });
});
