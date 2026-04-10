import type { APIRoute } from 'astro';
import { assembleGraph, makeIds, buildWebPage, buildImageObject, buildPiece } from '@jdevalk/seo-graph-core';
import { buildRecipePieces, siteWidePieces, SITE_URL, SITE_NAME, SITE_LANGUAGE } from '../../utils/schema';
import type { Cocktail } from '../../types';
import cocktails from '../../../cocktails.json';

export const GET: APIRoute = () => {
  const ids = makeIds({ siteUrl: SITE_URL });
  const homepageUrl = new URL('/', SITE_URL).toString();
  const allCocktails = cocktails as Cocktail[];

  const pieces = [
    ...siteWidePieces(SITE_URL),
    buildImageObject({
      pageUrl: homepageUrl,
      url: new URL('/og/home.jpg', SITE_URL).toString(),
      width: 1200,
      height: 630,
      caption: SITE_NAME,
    }, ids),
    buildWebPage({
      url: homepageUrl,
      name: SITE_NAME,
      description: `Browse ${allCocktails.length} cocktail recipes with ingredients, glassware, and preparation methods.`,
      isPartOf: { '@id': ids.website },
      primaryImage: { '@id': ids.primaryImage(homepageUrl) },
      inLanguage: SITE_LANGUAGE,
      mainEntity: { '@id': `${homepageUrl}#itemlist` },
    }, ids, 'CollectionPage'),
    buildPiece({
      '@type': 'ItemList',
      '@id': `${homepageUrl}#itemlist`,
      name: 'Cocktail recipes',
      numberOfItems: allCocktails.length,
      itemListOrder: 'https://schema.org/ItemListOrderAscending',
      itemListElement: allCocktails.map((cocktail, index) => {
        const cocktailUrl = new URL(`/${cocktail.slug}/`, SITE_URL).toString();
        return {
          '@type': 'ListItem',
          position: index + 1,
          url: cocktailUrl,
          item: { '@id': `${cocktailUrl}#recipe` },
        };
      }),
    }),
    ...allCocktails.flatMap((cocktail) => buildRecipePieces(SITE_URL, cocktail)),
  ];

  const graph = assembleGraph(pieces);

  return new Response(JSON.stringify(graph, null, 2), {
    headers: {
      'Content-Type': 'application/ld+json',
      'Cache-Control': 'max-age=300',
    },
  });
};
