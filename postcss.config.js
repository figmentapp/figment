// const purgecss = require('@fullhuman/postcss-purgecss')({
//   content: ['./index.html', './js/**/*.js'],
//   defaultExtractor: content => content.match(/[\w-/:]+(?<!:)/g) || []
// });

module.exports = {
  plugins: [require('tailwindcss')]
  //, ...(process.env.NODE_ENV === 'production' ? [purgecss] : [])]
};
