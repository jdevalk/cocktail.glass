import type { Cocktail, Ingredient } from '../types';
import { estimateCalories } from './calories';
import type { Organization, Recipe } from 'schema-dts';
import {
  makeIds,
  assembleGraph,
  buildWebSite,
  buildWebPage,
  buildBreadcrumbList,
  buildImageObject,
  buildSiteNavigationElement,
  buildPiece,
} from '@jdevalk/seo-graph-core';

export const SITE_NAME = 'Cocktail Glass';
export const SITE_LANGUAGE = 'en-US';
export const ORG_SLUG = 'cocktail-glass';
export const SITE_URL = 'https://cocktail.glass';

const WARN_DANGLING = import.meta.env.DEV;

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

function buildDescription(cocktail: Cocktail): string {
  return `How to make a ${cocktail.name}: ${cocktail.preparation.join('. ')}.`;
}

export function siteWidePieces(siteUrl: string) {
  const ids = makeIds({ siteUrl });
  const logoUrl = new URL('/emoji/cocktail-glass.svg', siteUrl).toString();
  const homepageUrl = new URL('/', siteUrl).toString();

  return [
    buildImageObject({
      id: logoUrl,
      url: logoUrl,
      width: 512,
      height: 512,
      caption: SITE_NAME,
      inLanguage: SITE_LANGUAGE,
    }, ids),
    buildPiece<Organization>({
      '@type': 'Organization',
      '@id': ids.organization(ORG_SLUG),
      name: SITE_NAME,
      url: homepageUrl,
      logo: { '@id': logoUrl },
      image: { '@id': logoUrl },
    }),
    buildWebSite({
      url: homepageUrl,
      name: SITE_NAME,
      publisher: { '@id': ids.organization(ORG_SLUG) },
      inLanguage: SITE_LANGUAGE,
      hasPart: { '@id': ids.navigation },
      potentialAction: {
        '@type': 'SearchAction',
        target: {
          '@type': 'EntryPoint',
          urlTemplate: `${homepageUrl}?q={search_term_string}`,
        },
        'query-input': {
          '@type': 'PropertyValueSpecification',
          valueRequired: true,
          valueName: 'search_term_string',
        },
      },
    }, ids),
    buildSiteNavigationElement({
      name: 'Main navigation',
      isPartOf: { '@id': ids.website },
      items: [
        { name: 'Home', url: homepageUrl },
        { name: 'Bar Equipment', url: new URL('/equipment/', siteUrl).toString() },
      ],
    }, ids),
  ];
}

export function buildHomepagePieces(siteUrl: string, cocktails: Cocktail[]) {
  const ids = makeIds({ siteUrl });
  const homepageUrl = new URL('/', siteUrl).toString();
  const ogImageUrl = new URL('/og/home.jpg', siteUrl).toString();

  return [
    buildImageObject({
      pageUrl: homepageUrl,
      url: ogImageUrl,
      width: 1200,
      height: 675,
      caption: SITE_NAME,
    }, ids),
    buildWebPage({
      url: homepageUrl,
      name: SITE_NAME,
      description: `Browse ${cocktails.length} cocktail recipes with ingredients, glassware, and preparation methods.`,
      isPartOf: { '@id': ids.website },
      primaryImage: { '@id': ids.primaryImage(homepageUrl) },
      inLanguage: SITE_LANGUAGE,
      mainEntity: { '@id': `${homepageUrl}#itemlist` },
    }, ids, 'CollectionPage'),
    buildPiece({
      '@type': 'ItemList',
      '@id': `${homepageUrl}#itemlist`,
      name: 'Cocktail recipes',
      numberOfItems: cocktails.length,
      itemListOrder: 'https://schema.org/ItemListOrderAscending',
      itemListElement: cocktails.map((cocktail, index) => ({
        '@type': 'ListItem',
        position: index + 1,
        item: {
          '@type': 'Recipe',
          name: cocktail.name,
          url: new URL(`/${cocktail.slug}/`, siteUrl).toString(),
        },
      })),
    }),
  ];
}

export function buildHomepageSchema(siteUrl: string, cocktails: Cocktail[]) {
  return assembleGraph([
    ...siteWidePieces(siteUrl),
    ...buildHomepagePieces(siteUrl, cocktails),
  ], { warnOnDanglingReferences: WARN_DANGLING });
}

export function buildRecipeSchema(
  siteUrl: string,
  pageUrl: string,
  cocktail: Cocktail,
  imageUrl?: string,
) {
  const ids = makeIds({ siteUrl });
  const description = buildDescription(cocktail);
  const recipeId = `${pageUrl}#recipe`;
  const prepMinutes = Math.max(3, cocktail.preparation.length);

  const pieces = [
    ...siteWidePieces(siteUrl),
  ];

  if (imageUrl) {
    pieces.push(
      buildImageObject({
        pageUrl,
        url: imageUrl,
        width: 640,
        height: 640,
        caption: cocktail.name,
        inLanguage: SITE_LANGUAGE,
      }, ids),
    );
  }

  pieces.push(
    buildBreadcrumbList({
      url: pageUrl,
      items: [
        { name: 'Home', url: new URL('/', siteUrl).toString() },
        { name: cocktail.name, url: pageUrl },
      ],
    }, ids),
    buildWebPage({
      url: pageUrl,
      name: cocktail.name,
      description,
      isPartOf: { '@id': ids.website },
      breadcrumb: { '@id': ids.breadcrumb(pageUrl) },
      inLanguage: SITE_LANGUAGE,
      ...(imageUrl ? { primaryImage: { '@id': ids.primaryImage(pageUrl) } } : {}),
      mainEntity: { '@id': recipeId },
    }, ids),
    buildPiece<Recipe>({
      '@type': 'Recipe',
      '@id': recipeId,
      mainEntityOfPage: { '@id': ids.webPage(pageUrl) },
      name: cocktail.name,
      description,
      inLanguage: SITE_LANGUAGE,
      recipeCategory: 'Drink',
      recipeCuisine: 'International',
      recipeYield: '1 cocktail',
      prepTime: `PT${prepMinutes}M`,
      cookTime: 'PT0M',
      totalTime: `PT${prepMinutes}M`,
      datePublished: '2025-01-01',
      nutrition: {
        '@type': 'NutritionInformation',
        calories: `${estimateCalories(cocktail.ingredients)} calories`,
      },
      recipeIngredient: cocktail.ingredients.map(formatIngredientText),
      recipeInstructions: cocktail.preparation.map((step, index) => ({
        '@type': 'HowToStep',
        name: step.split(/[\s,.(]/)[0].replace(/\.$/, ''),
        text: step,
        url: `${pageUrl}#step${index + 1}`,
      })),
      keywords: ['cocktail', cocktail.category, cocktail.glass, ...cocktail.ingredients.map((ingredient) => ingredient.name)].join(', '),
      author: { '@id': ids.organization(ORG_SLUG) },
      ...(imageUrl ? { image: { '@id': ids.primaryImage(pageUrl) } } : {}),
    }),
  );

  return assembleGraph(pieces, { warnOnDanglingReferences: WARN_DANGLING });
}

export function buildRecipePieces(siteUrl: string, cocktail: Cocktail) {
  const ids = makeIds({ siteUrl });
  const pageUrl = new URL(`/${cocktail.slug}/`, siteUrl).toString();
  const description = buildDescription(cocktail);
  const recipeId = `${pageUrl}#recipe`;
  const prepMinutes = Math.max(3, cocktail.preparation.length);

  return [
    buildWebPage({
      url: pageUrl,
      name: cocktail.name,
      description,
      isPartOf: { '@id': ids.website },
      inLanguage: SITE_LANGUAGE,
      mainEntity: { '@id': recipeId },
    }, ids),
    buildPiece<Recipe>({
      '@type': 'Recipe',
      '@id': recipeId,
      mainEntityOfPage: { '@id': ids.webPage(pageUrl) },
      name: cocktail.name,
      description,
      inLanguage: SITE_LANGUAGE,
      recipeCategory: 'Drink',
      recipeCuisine: 'International',
      recipeYield: '1 cocktail',
      prepTime: `PT${prepMinutes}M`,
      cookTime: 'PT0M',
      totalTime: `PT${prepMinutes}M`,
      datePublished: '2025-01-01',
      nutrition: {
        '@type': 'NutritionInformation',
        calories: `${estimateCalories(cocktail.ingredients)} calories`,
      },
      recipeIngredient: cocktail.ingredients.map(formatIngredientText),
      recipeInstructions: cocktail.preparation.map((step, index) => ({
        '@type': 'HowToStep',
        name: step.split(/[\s,.(]/)[0].replace(/\.$/, ''),
        text: step,
        url: `${pageUrl}#step${index + 1}`,
      })),
      keywords: ['cocktail', cocktail.category, cocktail.glass, ...cocktail.ingredients.map((ingredient) => ingredient.name)].join(', '),
      author: { '@id': ids.organization(ORG_SLUG) },
    }),
  ];
}
