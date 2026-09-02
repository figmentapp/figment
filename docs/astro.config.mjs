import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import remarkDirective from 'remark-directive';
import remarkAdmonitions from './src/plugins/remark-admonitions.mjs';

export default defineConfig({
  site: 'https://figmentapp.com',
  integrations: [react()],
  markdown: {
    remarkPlugins: [remarkDirective, remarkAdmonitions],
  },
});
