import { defineConfig } from 'astro/config';
import pagefind from 'astro-pagefind';
import { imageSitemap } from './integrations/image-sitemap.mjs';

export default defineConfig({
  site: 'https://cocktail.glass',
  output: 'static',
  integrations: [imageSitemap(), pagefind()],
  build: {
    inlineStylesheets: 'always',
  },
});
