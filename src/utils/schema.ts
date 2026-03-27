import type { Cocktail, Ingredient } from '../types';

type JsonLdNode = Record<string, unknown>;

function toAbsoluteUrl(path: string, siteUrl: string): string {
  return new URL(path, siteUrl).toString();
}

function buildDescription(cocktail: Cocktail): string {
  return `How to make a ${cocktail.name}: ${cocktail.preparation}`;
}

export function formatIngredientAmount(ingredient: Ingredient): string {
  if (!ingredient.amount && !ingredient.unit) {
    return '';
  }

  if (!ingredient.amount) {
    return ingredient.unit;
  }

  if (ingredient.unit === 'ml') {
    return `${ingredient.amount} ml`;
  }

  if (ingredient.unit === 'dash' || ingredient.unit === 'dashes') {
    const dashUnit = Number.parseInt(ingredient.amount, 10) === 1 ? 'dash' : 'dashes';
    return `${ingredient.amount} ${dashUnit}`;
  }

  return `${ingredient.amount} ${ingredient.unit}`.trim();
}

export function formatIngredientText(ingredient: Ingredient): string {
  const amount = formatIngredientAmount(ingredient);
  return amount ? `${amount} ${ingredient.name}` : ingredient.name;
}

export function buildHomepageSchema(siteUrl: string, cocktails: Cocktail[]): JsonLdNode {
  const homepageUrl = toAbsoluteUrl('/', siteUrl);
  const websiteId = `${homepageUrl}#website`;
  const collectionId = `${homepageUrl}#collection`;
  const itemListId = `${homepageUrl}#item-list`;
  const description = 'Browse 500 cocktail recipes with ingredients, glassware, and preparation methods.';

  return {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'WebSite',
        '@id': websiteId,
        url: homepageUrl,
        name: 'Cocktail Glass',
        description,
        inLanguage: 'en',
      },
      {
        '@type': 'CollectionPage',
        '@id': collectionId,
        url: homepageUrl,
        name: 'Cocktail Glass',
        description,
        isPartOf: {
          '@id': websiteId,
        },
        about: {
          '@type': 'Thing',
          name: 'Cocktail recipes',
        },
        primaryImageOfPage: {
          '@type': 'ImageObject',
          url: toAbsoluteUrl('/og/home.jpg', siteUrl),
        },
        mainEntity: {
          '@id': itemListId,
        },
      },
      {
        '@type': 'ItemList',
        '@id': itemListId,
        name: 'Cocktail recipes',
        numberOfItems: cocktails.length,
        itemListOrder: 'https://schema.org/ItemListOrderAscending',
        itemListElement: cocktails.map((cocktail, index) => {
          const recipeUrl = toAbsoluteUrl(`/${cocktail.slug}/`, siteUrl);

          return {
            '@type': 'ListItem',
            position: index + 1,
            item: {
              '@type': 'Recipe',
              '@id': `${recipeUrl}#recipe`,
              name: cocktail.name,
              url: recipeUrl,
            },
          };
        }),
      },
    ],
  };
}

export function buildRecipeSchema(
  siteUrl: string,
  pageUrl: string,
  cocktail: Cocktail,
  imageUrl?: string,
): JsonLdNode {
  const websiteId = `${toAbsoluteUrl('/', siteUrl)}#website`;
  const webpageId = `${pageUrl}#webpage`;
  const breadcrumbId = `${pageUrl}#breadcrumb`;
  const recipeId = `${pageUrl}#recipe`;
  const description = buildDescription(cocktail);
  const recipeNode: JsonLdNode = {
    '@type': 'Recipe',
    '@id': recipeId,
    name: cocktail.name,
    description,
    url: pageUrl,
    recipeCategory: cocktail.category,
    recipeIngredient: cocktail.ingredients.map(formatIngredientText),
    recipeInstructions: [
      {
        '@type': 'HowToStep',
        name: 'Prepare the cocktail',
        text: cocktail.preparation,
      },
      ...(cocktail.garnish
        ? [
            {
              '@type': 'HowToStep',
              name: 'Add the garnish',
              text: `Garnish with ${cocktail.garnish}.`,
            },
          ]
        : []),
    ],
    keywords: ['cocktail', cocktail.category, cocktail.glass, ...cocktail.ingredients.map((ingredient) => ingredient.name)].join(', '),
    mainEntityOfPage: {
      '@id': webpageId,
    },
    author: {
      '@type': 'Organization',
      name: 'Cocktail Glass',
    },
  };

  if (imageUrl) {
    recipeNode.image = [imageUrl];
  }

  return {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'WebPage',
        '@id': webpageId,
        url: pageUrl,
        name: cocktail.name,
        description,
        isPartOf: {
          '@id': websiteId,
        },
        breadcrumb: {
          '@id': breadcrumbId,
        },
        mainEntity: {
          '@id': recipeId,
        },
        ...(imageUrl
          ? {
              primaryImageOfPage: {
                '@type': 'ImageObject',
                url: imageUrl,
              },
            }
          : {}),
      },
      {
        '@type': 'BreadcrumbList',
        '@id': breadcrumbId,
        itemListElement: [
          {
            '@type': 'ListItem',
            position: 1,
            name: 'Cocktail Glass',
            item: toAbsoluteUrl('/', siteUrl),
          },
          {
            '@type': 'ListItem',
            position: 2,
            name: cocktail.name,
            item: pageUrl,
          },
        ],
      },
      recipeNode,
    ],
  };
}
