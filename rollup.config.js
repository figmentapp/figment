import commonjs from '@rollup/plugin-commonjs';
import resolve from '@rollup/plugin-node-resolve';

const production = !process.env.ROLLUP_WATCH;

export default {
  input: 'src/figment-player.js',

  output: {
    sourcemap: true,
    format: 'iife',
    name: 'figmentPlayer',
    file: 'demo/build/figment-player.js',
  },
  plugins: [
    resolve({
      browser: true,
    }),
    commonjs(),
  ],
  watch: {
    clearScreen: false,
  },
};
