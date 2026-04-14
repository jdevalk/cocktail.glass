import type { APIRoute } from 'astro';
import { assembleGraph } from '@jdevalk/seo-graph-core';
import { buildRecipePieces, buildHomepagePieces, siteWidePieces } from '../../utils/schema';
import type { Cocktail } from '../../types';
import cocktails from '../../../cocktails.json';

export const GET: APIRoute = ({ site }) => {
  const siteUrl = site?.toString().replace(/\/$/, '') ?? 'https://cocktail.glass';
  const allCocktails = cocktails as Cocktail[];

  const graph = assembleGraph(
    [
      ...siteWidePieces(siteUrl),
      ...buildHomepagePieces(siteUrl, allCocktails),
      ...allCocktails.flatMap((cocktail) => buildRecipePieces(siteUrl, cocktail)),
    ],
    { warnOnDanglingReferences: true },
  );

  return new Response(JSON.stringify(graph, null, 2), {
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'max-age=300',
    },
  });
};
