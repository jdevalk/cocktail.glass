import type { Cocktail } from '../types';

let cachedFrequency: Map<string, number> | null = null;

function getFrequencyMap(cocktails: Cocktail[]): Map<string, number> {
  if (cachedFrequency) return cachedFrequency;
  cachedFrequency = new Map();
  for (const c of cocktails) {
    for (const i of c.ingredients) {
      cachedFrequency.set(i.name, (cachedFrequency.get(i.name) || 0) + 1);
    }
  }
  return cachedFrequency;
}

// Ingredients that aren't distinctive enough to feature
const SKIP = new Set([
  'water', 'hot water', 'ice', 'sugar cube', 'salt', 'egg white', 'whole egg', 'egg',
]);

export function getDistinctiveIngredient(cocktail: Cocktail, allCocktails: Cocktail[]): string | null {
  const nameLower = cocktail.name.toLowerCase();

  // If the cocktail name starts with an ingredient name, that's the distinctive one
  for (const i of cocktail.ingredients) {
    if (nameLower.startsWith(i.name.toLowerCase())) return i.name;
  }

  // Otherwise fall back to the least common ingredient
  const freq = getFrequencyMap(allCocktails);
  let best: string | null = null;
  let bestScore = Infinity;

  for (const i of cocktail.ingredients) {
    if (i.unit === 'dash' || i.unit === 'drop' || i.unit === 'pinch') continue;
    if (SKIP.has(i.name.toLowerCase())) continue;
    if (i.unit === 'barspoon') continue;
    const count = freq.get(i.name) || 0;
    if (count < bestScore) {
      bestScore = count;
      best = i.name;
    }
  }

  return best;
}
