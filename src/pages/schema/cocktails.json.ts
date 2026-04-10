import { createSchemaEndpoint } from '@jdevalk/astro-seo-graph';
import { buildRecipePieces, SITE_URL } from '../../utils/schema';
import type { Cocktail } from '../../types';
import cocktails from '../../../cocktails.json';

export const GET = createSchemaEndpoint<Cocktail>({
  entries: () => Promise.resolve(cocktails as Cocktail[]),
  mapper: (cocktail) => buildRecipePieces(SITE_URL, cocktail),
});
