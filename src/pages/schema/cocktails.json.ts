import type { APIRoute } from 'astro';
import { buildRecipePieces } from '../../utils/schema';
import type { Cocktail } from '../../types';
import cocktails from '../../../cocktails.json';

export const GET: APIRoute = ({ site }) => {
  const siteUrl = site?.toString().replace(/\/$/, '') ?? 'https://cocktail.glass';
  const allCocktails = cocktails as Cocktail[];

  const entities = allCocktails.flatMap((cocktail) => buildRecipePieces(siteUrl, cocktail));

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
