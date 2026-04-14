import { defineConfig } from 'astro/config';
import pagefind from 'astro-pagefind';
import seoGraph from '@jdevalk/astro-seo-graph/integration';
import { imageSitemap } from './integrations/image-sitemap.mjs';

// Only submit to IndexNow on the production Cloudflare Pages branch.
// Local `npm run build` and preview deploys must not ping the endpoint
// with URLs the production host hasn't served yet — that gets the key
// rejected (403) and forces rotation.
const isProductionBuild =
  process.env.CF_PAGES === '1' && process.env.CF_PAGES_BRANCH === 'main';

const indexNowKey = process.env.INDEXNOW_KEY;

export default defineConfig({
  site: 'https://cocktail.glass',
  output: 'static',
  integrations: [
    seoGraph({
      validateH1: true,
      validateUniqueMetadata: true,
      validateImageAlt: true,
      // Cocktail names are deliberately short ("Vesper", "Sazerac"); the
      // default min of 30 doesn't fit. The template is "<Name> ~ Cocktail Glass"
      // so 18 chars covers a 5-letter cocktail name with the suffix.
      validateMetadataLength: { title: { min: 18, max: 65 } },
      validateInternalLinks: {
        skip: (href) =>
          href.startsWith('/images/') ||
          href.startsWith('/og/') ||
          href.startsWith('/fonts/') ||
          href.startsWith('/emoji/') ||
          href.startsWith('/api/') ||
          href.startsWith('/pagefind/') ||
          href.startsWith('/schema/') ||
          href === '/favicon.svg' ||
          href === '/sitemap.xml' ||
          href === '/schemamap.xml' ||
          href === '/robots.txt',
      },
      llmsTxt: {
        title: 'Cocktail Glass',
        siteUrl: 'https://cocktail.glass',
        summary: 'Browse 500 cocktail recipes with ingredients, glassware, and preparation methods.',
        filter: (url) => !/\/404\/?$/.test(new URL(url).pathname),
      },
      ...(isProductionBuild && indexNowKey && {
        indexNow: {
          key: indexNowKey,
          host: 'cocktail.glass',
          siteUrl: 'https://cocktail.glass',
        },
      }),
    }),
    imageSitemap(),
    pagefind(),
  ],
  build: {
    inlineStylesheets: 'always',
  },
});
