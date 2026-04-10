import { createSchemaMap } from '@jdevalk/astro-seo-graph';
import { SITE_URL } from '../utils/schema';

export const GET = createSchemaMap({
  siteUrl: SITE_URL,
  entries: [
    { path: '/schema/cocktails.json', lastModified: new Date() },
  ],
});
