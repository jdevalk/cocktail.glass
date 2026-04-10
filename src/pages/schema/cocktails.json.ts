import type { APIRoute } from 'astro';
import { makeIds, buildWebPage, buildImageObject, buildPiece } from '@jdevalk/seo-graph-core';
import type { Recipe as RecipeType } from 'schema-dts';
import { buildRecipePieces, SITE_URL, SITE_NAME, SITE_LANGUAGE } from '../../utils/schema';
import type { Cocktail } from '../../types';
import cocktails from '../../../cocktails.json';

export const GET: APIRoute = () => {
  const allCocktails = cocktails as Cocktail[];

  // Build all recipe pieces (WebPage + Recipe per cocktail)
  const entities = allCocktails.flatMap((cocktail) => buildRecipePieces(SITE_URL, cocktail));

  // NDJSON: one JSON-LD object per line, each with its own @context
  const ndjson = entities
    .map((entity) => JSON.stringify({ '@context': 'https://schema.org', ...entity }))
    .join('\n');

  return new Response(ndjson, {
    headers: {
      'Content-Type': 'application/x-ndjson',
      'Cache-Control': 'max-age=300',
    },
  });
};
