import type { APIRoute } from 'astro';
import type { Cocktail } from '../types';
import cocktails from '../../cocktails.json';

/**
 * Flat JSON catalogue of every cocktail, each enriched with its canonical
 * page URL. Consumed lazily by the WebMCP tools in components/WebMcp.astro,
 * and useful on its own as a plain data feed for agents and developers.
 */
export const GET: APIRoute = ({ site }) => {
  const siteUrl = site?.toString().replace(/\/$/, '') ?? 'https://cocktail.glass';
  const allCocktails = cocktails as Cocktail[];

  const data = allCocktails.map((cocktail) => ({
    ...cocktail,
    url: `${siteUrl}/${cocktail.slug}/`,
  }));

  return new Response(JSON.stringify(data), {
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'max-age=3600',
    },
  });
};
