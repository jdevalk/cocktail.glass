import type { Cocktail } from '../types';

let cachedFrequency: Map<string, number> | null = null;

function getFrequencyMap(cocktails: Cocktail[]): Map<string, number> {
  if (cachedFrequency) return cachedFrequency;
  cachedFrequency = new Map();
  for (const c of cocktails) {
    for (const i of c.ingredients) {
      if (i.unit === 'garnish') continue;
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
  const freq = getFrequencyMap(allCocktails);
  let best: string | null = null;
  let bestScore = Infinity;

  for (const i of cocktail.ingredients) {
    if (i.unit === 'garnish') continue;
    if (i.unit === 'dash' || i.unit === 'drop' || i.unit === 'pinch') continue;
    if (SKIP.has(i.name.toLowerCase())) continue;
    // Skip barspoon amounts — too small to be the defining ingredient
    if (i.unit === 'barspoon') continue;
    const count = freq.get(i.name) || 0;
    if (count < bestScore) {
      bestScore = count;
      best = i.name;
    }
  }

  return best;
}
