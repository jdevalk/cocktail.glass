import type { Cocktail, Ingredient } from '../types';
import { estimateCalories } from './calories';

type JsonLdNode = Record<string, unknown>;

const SITE_NAME = 'Cocktail Glass';
const SITE_LANGUAGE = 'en-US';

function toAbsoluteUrl(path: string, siteUrl: string): string {
  return new URL(path, siteUrl).toString();
}

function buildDescription(cocktail: Cocktail): string {
  return `How to make a ${cocktail.name}: ${cocktail.preparation.join('. ')}.`;
}

function buildOrganizationId(siteUrl: string): string {
  return `${toAbsoluteUrl('/', siteUrl)}#/schema.org/Organization/1`;
}

function buildWebsiteId(siteUrl: string): string {
  return `${toAbsoluteUrl('/', siteUrl)}#/schema.org/WebSite/1`;
}

function buildLogoNode(siteUrl: string): JsonLdNode {
  const logoUrl = toAbsoluteUrl('/emoji/cocktail-glass.svg', siteUrl);

  return {
    '@type': 'ImageObject',
    '@id': logoUrl,
    url: logoUrl,
    contentUrl: logoUrl,
    caption: SITE_NAME,
    inLanguage: SITE_LANGUAGE,
  };
}

function buildOrganizationNode(siteUrl: string): JsonLdNode {
  const homepageUrl = toAbsoluteUrl('/', siteUrl);
  const logoUrl = toAbsoluteUrl('/emoji/cocktail-glass.svg', siteUrl);

  return {
    '@type': 'Organization',
    '@id': buildOrganizationId(siteUrl),
    name: SITE_NAME,
    url: homepageUrl,
    logo: {
      '@id': logoUrl,
    },
    image: {
      '@id': logoUrl,
    },
  };
}

function buildWebsiteNode(siteUrl: string): JsonLdNode {
  return {
    '@type': 'WebSite',
    '@id': buildWebsiteId(siteUrl),
    url: toAbsoluteUrl('/', siteUrl),
    name: SITE_NAME,
    publisher: {
      '@id': buildOrganizationId(siteUrl),
    },
    inLanguage: SITE_LANGUAGE,
  };
}

function buildImageNode(imageUrl: string, imageId: string, caption: string): JsonLdNode {
  return {
    '@type': 'ImageObject',
    '@id': imageId,
    url: imageUrl,
    contentUrl: imageUrl,
    caption,
    inLanguage: SITE_LANGUAGE,
  };
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
  const homepageImageId = `${homepageUrl}#primaryimage`;
  const itemListId = `${homepageUrl}#itemlist`;
  const description = 'Browse 500 cocktail recipes with ingredients, glassware, and preparation methods.';

  return {
    '@context': 'https://schema.org',
    '@graph': [
      buildLogoNode(siteUrl),
      buildOrganizationNode(siteUrl),
      buildWebsiteNode(siteUrl),
      buildImageNode(toAbsoluteUrl('/og/home.jpg', siteUrl), homepageImageId, SITE_NAME),
      {
        '@type': 'CollectionPage',
        '@id': homepageUrl,
        url: homepageUrl,
        name: SITE_NAME,
        description,
        isPartOf: {
          '@id': buildWebsiteId(siteUrl),
        },
        inLanguage: SITE_LANGUAGE,
        primaryImageOfPage: {
          '@id': homepageImageId,
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
        itemListElement: cocktails.map((cocktail, index) => ({
          '@type': 'ListItem',
          position: index + 1,
          item: {
            '@type': 'Recipe',
            name: cocktail.name,
            url: toAbsoluteUrl(`/${cocktail.slug}/`, siteUrl),
          },
        })),
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
  const description = buildDescription(cocktail);
  const pageId = pageUrl;
  const recipeId = `${pageUrl}#recipe`;
  const breadcrumbId = `${pageUrl}#breadcrumb`;
  const imageId = `${pageUrl}#primaryimage`;

  const graph: JsonLdNode[] = [
    buildLogoNode(siteUrl),
    buildOrganizationNode(siteUrl),
    buildWebsiteNode(siteUrl),
  ];

  if (imageUrl) {
    graph.push(buildImageNode(imageUrl, imageId, cocktail.name));
  }

  graph.push(
    {
      '@type': 'BreadcrumbList',
      '@id': breadcrumbId,
      itemListElement: [
        {
          '@type': 'ListItem',
          position: 1,
          name: 'Home',
          item: toAbsoluteUrl('/', siteUrl),
        },
        {
          '@type': 'ListItem',
          position: 2,
          name: cocktail.name,
        },
      ],
    },
    {
      '@type': 'WebPage',
      '@id': pageId,
      url: pageUrl,
      name: cocktail.name,
      description,
      isPartOf: {
        '@id': buildWebsiteId(siteUrl),
      },
      breadcrumb: {
        '@id': breadcrumbId,
      },
      inLanguage: SITE_LANGUAGE,
      potentialAction: [
        {
          '@type': 'ReadAction',
          target: [pageUrl],
        },
      ],
      ...(imageUrl
        ? {
            primaryImageOfPage: {
              '@id': imageId,
            },
          }
        : {}),
    },
    {
      '@type': 'Recipe',
      '@id': recipeId,
      mainEntityOfPage: {
        '@id': pageId,
      },
      name: cocktail.name,
      description,
      inLanguage: SITE_LANGUAGE,
      recipeCategory: 'Drink',
      recipeCuisine: 'International',
      recipeYield: '1 cocktail',
      prepTime: `PT${Math.max(3, cocktail.preparation.length)}M`,
      cookTime: 'PT0M',
      nutrition: {
        '@type': 'NutritionInformation',
        calories: `${estimateCalories(cocktail.ingredients)} calories`,
      },
      recipeIngredient: cocktail.ingredients.map(formatIngredientText),
      recipeInstructions: cocktail.preparation.map((step, index) => ({
        '@type': 'HowToStep' as const,
        name: step.split(/[\s,.(]/)[0].replace(/\.$/, ''),
        text: step,
        url: `${pageUrl}#step${index + 1}`,
      })),
      keywords: ['cocktail', cocktail.category, cocktail.glass, ...cocktail.ingredients.map((ingredient) => ingredient.name)].join(', '),
      author: {
        '@id': buildOrganizationId(siteUrl),
      },
      ...(imageUrl
        ? {
            image: {
              '@id': imageId,
            },
          }
        : {}),
    },
  );

  return {
    '@context': 'https://schema.org',
    '@graph': graph,
  };
}
