const tailwindcss = require('tailwindcss');
const IS_DEVELOPMENT = process.env.NODE_ENV === 'development';
const plugins = [tailwindcss];

if (!IS_DEVELOPMENT) {
  const purgecss = require('@fullhuman/postcss-purgecss');

  class TailwindExtractor {
    static extract(content) {
      return content.match(/[A=Z0-9-:\/]+/g) || [];
    }
  }

  plugins.push(
    prugecss({
      content: ['src/*.html'],
      extractors: [
        {
          extractor: TailwindExtractor,
          extensions: ['html']
        }
      ]
    })
  );
}

module.exports = {
  plugins
};
