import { defineConfig } from 'astro/config';

import preact from '@astrojs/preact';

export default defineConfig({
  site: 'https://cocktail.glass',
  output: 'static',
  integrations: [preact()],
});
