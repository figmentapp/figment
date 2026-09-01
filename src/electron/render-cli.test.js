import { describe, expect, test } from 'vitest';
import { parseRenderArgs } from './render-cli.js';

const cwd = '/work';

describe('parseRenderArgs', () => {
  test('returns null when --render is absent, whatever else is passed', () => {
    expect(parseRenderArgs(['project.fgmt'], cwd)).toBeNull();
    expect(parseRenderArgs(['-psn_0_12345', '--enable-logging'], cwd)).toBeNull();
  });

  test('resolves the project and output template against the working directory', () => {
    const job = parseRenderArgs(['--render', 'test.fgmt', '--frames', '150', '-o', 'out/test-####.png'], cwd);
    expect(job).toEqual({
      project: '/work/test.fgmt',
      output: '/work/out/test-####.png',
      frames: 150,
      fps: null,
      quality: 0.9,
    });
  });

  test('accepts --output as the long form of -o', () => {
    const job = parseRenderArgs(['--render', 'a.fgmt', '--output', 'still.png'], cwd);
    expect(job.output).toBe('/work/still.png');
  });

  test('leaves frames and fps null so the project can supply them', () => {
    const job = parseRenderArgs(['--render', 'a.fgmt'], cwd);
    expect(job.frames).toBeNull();
    expect(job.fps).toBeNull();
    expect(job.output).toBeNull();
  });

  test('rejects a --render flag without a project path', () => {
    expect(() => parseRenderArgs(['--render'], cwd)).toThrow(/--render requires a project file/);
  });

  test('rejects a non-positive or non-integer frame count', () => {
    expect(() => parseRenderArgs(['--render', 'a.fgmt', '--frames', '0'], cwd)).toThrow(/--frames/);
    expect(() => parseRenderArgs(['--render', 'a.fgmt', '--frames', '1.5'], cwd)).toThrow(/--frames/);
    expect(() => parseRenderArgs(['--render', 'a.fgmt', '--frames', 'abc'], cwd)).toThrow(/--frames/);
  });

  test('rejects a non-positive fps and an out-of-range quality', () => {
    expect(() => parseRenderArgs(['--render', 'a.fgmt', '--fps', '0'], cwd)).toThrow(/--fps/);
    expect(() => parseRenderArgs(['--render', 'a.fgmt', '--quality', '1.5'], cwd)).toThrow(/--quality/);
  });

  test('rejects an output template with more than one frame and no # padding', () => {
    expect(() => parseRenderArgs(['--render', 'a.fgmt', '--frames', '2', '-o', 'still.png'], cwd)).toThrow(/#/);
  });

  test('accepts an output template without # padding for a single frame', () => {
    const job = parseRenderArgs(['--render', 'a.fgmt', '--frames', '1', '-o', 'still.png'], cwd);
    expect(job.output).toBe('/work/still.png');
  });

  test('rejects an output template with an unsupported extension', () => {
    expect(() => parseRenderArgs(['--render', 'a.fgmt', '-o', 'frame-###.tiff'], cwd)).toThrow(/png|jpg/);
  });

  test('rejects a stray positional argument such as a template passed without -o', () => {
    expect(() => parseRenderArgs(['--render', 'a.fgmt', 'tmp/test-####.png'], cwd)).toThrow(/Unexpected argument "tmp\/test-####.png"/);
  });

  test('rejects unknown flags', () => {
    expect(() => parseRenderArgs(['--render', 'a.fgmt', '--out', 'x-###.png'], cwd)).toThrow(/Unknown option --out/);
  });
});
