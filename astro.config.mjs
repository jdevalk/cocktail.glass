import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';
import pagefind from 'astro-pagefind';

export default defineConfig({
  site: 'https://cocktail.glass',
  output: 'static',
  integrations: [sitemap(), pagefind()],
  build: {
    inlineStylesheets: 'always',
  },
});
