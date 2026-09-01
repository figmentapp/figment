// Command-line interface for headless rendering:
//   Figment --render project.fgmt [-o frame-####.png] [--frames N] [--fps N] [--quality Q]
// Pure argument parsing lives here so it can be unit-tested without Electron.
// Only src/electron ships in the packaged asar, so this file must not import
// from the rest of src.
import path from 'path';
import minimist from 'minimist';

export const USAGE = `Usage: Figment --render <project.fgmt> [options]

Render a project without opening the editor. The project must have an Out node.
Save Image nodes write their frames as they do in File > Render. Pass --output
to write the Out node's image as well.

Options:
  -o, --output <template>  Write the Out node image to this path. Use # for the
                           frame number, e.g. frames/shot-####.png (png or jpg).
                           Required when the project has no Save Image node.
  --frames <n>             Number of frames to render. Defaults to the longest
                           Load Movie in the project, or 1.
  --fps <n>                Export frame rate. Defaults to the movie's frame rate, or 60.
  --quality <0..1>         JPEG quality for --output (default 0.9).
  --help                   Show this help.
`;

const KNOWN_OPTIONS = new Set(['render', 'output', 'o', 'frames', 'fps', 'quality', 'help']);

export class RenderCliError extends Error {}

function fail(message) {
  throw new RenderCliError(message);
}

function parsePositiveNumber(raw, flag, { integer = false } = {}) {
  if (raw === undefined) return null;
  const value = Number(raw);
  if (!Number.isFinite(value) || value <= 0 || (integer && !Number.isInteger(value))) {
    fail(`${flag} must be a positive ${integer ? 'integer' : 'number'}, got "${raw}".`);
  }
  return value;
}

// Returns a render job, or null when the arguments do not ask for a render.
// Throws RenderCliError with a user-facing message for invalid arguments.
export function parseRenderArgs(args, cwd) {
  // Only a --render invocation is parsed strictly: a normal launch may carry
  // switches from the OS or Chromium that are none of our business.
  if (!args.some((arg) => arg === '--render' || arg.startsWith('--render='))) return null;
  const argv = minimist(args, {
    string: ['render', 'output', 'frames', 'fps', 'quality'],
    boolean: ['help'],
    alias: { o: 'output' },
    unknown: (arg) => {
      if (arg.startsWith('-')) fail(`Unknown option ${arg.split('=')[0]}.\n\n${USAGE}`);
      return true;
    },
  });
  for (const key of Object.keys(argv)) {
    if (key !== '_' && !KNOWN_OPTIONS.has(key)) fail(`Unknown option --${key}.\n\n${USAGE}`);
  }
  if (argv.render === undefined) return null;
  if (!argv.render) fail(`--render requires a project file.\n\n${USAGE}`);
  if (argv._.length > 0) fail(`Unexpected argument "${argv._[0]}". Did you mean --output ${argv._[0]}?\n\n${USAGE}`);

  const frames = parsePositiveNumber(argv.frames, '--frames', { integer: true });
  const fps = parsePositiveNumber(argv.fps, '--fps');
  let quality = 0.9;
  if (argv.quality !== undefined) {
    quality = Number(argv.quality);
    if (!Number.isFinite(quality) || quality < 0 || quality > 1) {
      fail(`--quality must be between 0 and 1, got "${argv.quality}".`);
    }
  }

  let output = null;
  if (argv.output !== undefined) {
    if (!argv.output) fail('--output requires a file template.');
    if (!/\.(png|jpe?g)$/i.test(argv.output)) {
      fail(`--output must end in .png or .jpg, got "${argv.output}".`);
    }
    // With --frames omitted the count comes from the project; the renderer re-checks then.
    if (!argv.output.includes('#') && frames !== null && frames > 1) {
      fail(`--output needs # placeholders for the frame number when rendering more than one frame, e.g. "frame-####.png".`);
    }
    output = path.resolve(cwd, argv.output);
  }

  return {
    project: path.resolve(cwd, argv.render),
    output,
    frames,
    fps,
    quality,
  };
}
