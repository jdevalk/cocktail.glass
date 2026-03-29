import type { Cocktail } from '../types';
import { getDistinctiveIngredient } from './distinctive';

interface SimilarCocktail {
  slug: string;
  name: string;
  score: number;
}

// Precompute ingredient sets once for all cocktails
let cachedSets: Map<string, Set<string>> | null = null;

function getIngredientSets(cocktails: Cocktail[]): Map<string, Set<string>> {
  if (cachedSets) return cachedSets;
  cachedSets = new Map();
  for (const c of cocktails) {
    const ings = new Set(
      c.ingredients
        .filter((i) => i.unit !== 'garnish')
        .map((i) => i.name.toLowerCase())
    );
    cachedSets.set(c.slug, ings);
  }
  return cachedSets;
}

export function findSimilar(cocktail: Cocktail, allCocktails: Cocktail[], count = 3): SimilarCocktail[] {
  const sets = getIngredientSets(allCocktails);
  const targetIngs = sets.get(cocktail.slug)!;
  const distinctive = getDistinctiveIngredient(cocktail, allCocktails)?.toLowerCase();

  const scored: SimilarCocktail[] = [];

  for (const other of allCocktails) {
    if (other.slug === cocktail.slug) continue;
    const otherIngs = sets.get(other.slug)!;

    // Jaccard similarity: intersection / union
    let intersection = 0;
    for (const ing of targetIngs) {
      if (otherIngs.has(ing)) intersection++;
    }
    const union = targetIngs.size + otherIngs.size - intersection;
    const jaccard = union > 0 ? intersection / union : 0;

    // Bonus for same glass or category
    let bonus = 0;
    if (other.glass === cocktail.glass) bonus += 0.05;
    if (other.category === cocktail.category) bonus += 0.05;

    // Strong bonus for sharing the distinctive ingredient
    if (distinctive && otherIngs.has(distinctive)) bonus += 0.3;

    const score = jaccard + bonus;
    if (score > 0) {
      scored.push({ slug: other.slug, name: other.name, score });
    }
  }

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, count);
}
