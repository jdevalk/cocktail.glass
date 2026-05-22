/**
 * Shared catalogue resolver.
 *
 * cocktails.json stores each ingredient as a `ref` into ingredients.json —
 * the single source of truth for ingredient names. This module joins the two
 * so consumers get a denormalised view: every cocktail ingredient carries its
 * resolved `name` and `type` alongside `ref`, `amount`, and `unit`.
 *
 * Astro pages, Cloudflare Pages Functions, and the public /cocktails.json feed
 * all import from here, so the join logic lives in exactly one place.
 */
import rawCocktails from './cocktails.json';
import rawIngredients from './ingredients.json';

const byId = new Map(rawIngredients.map((i) => [i.id, i]));

/** The canonical ingredient table (id, name, type, aliases). */
export const ingredients = rawIngredients;

/** Cocktails with each ingredient joined to its resolved name and type. */
export const cocktails = rawCocktails.map((cocktail) => ({
  ...cocktail,
  ingredients: cocktail.ingredients.map((i) => {
    const def = byId.get(i.ref);
    return {
      ref: i.ref,
      name: def ? def.name : i.ref,
      type: def ? def.type : 'other',
      amount: i.amount,
      unit: i.unit,
    };
  }),
}));

export default cocktails;
