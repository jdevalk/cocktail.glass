import type { Ingredient } from '../types';

// Calories per ml for common cocktail ingredient categories
// Spirits (~40% ABV): 2.3 cal/ml | Liqueurs (~25% ABV, sugary): 2.5 cal/ml
// Wine/vermouth (~18% ABV): 1.3 cal/ml | Beer/sparkling (~12%): 0.9 cal/ml
// Juice: 0.4 cal/ml | Soda/tonic: 0.35 cal/ml | Syrup: 2.5 cal/ml
// Cream: 3.4 cal/ml | Egg white: ~17 cal per white
const CALORIE_MAP: Record<string, number> = {};

// Spirits (~40% ABV) → ~2.3 cal/ml
for (const s of ['Gin', 'Vodka', 'Bourbon', 'Rye whiskey', 'Scotch', 'Blended Scotch', 'Islay Scotch',
  'Irish whiskey', 'Japanese whisky', 'Canadian whisky', 'Tennessee whiskey', 'Cognac', 'Brandy',
  'White rum', 'Dark rum', 'Dark Jamaican rum', 'Dark Demerara rum', 'Aged rum', 'Gold rum',
  'Overproof rum', 'Cachaça', 'Tequila blanco', 'Tequila reposado', 'Tequila añejo', 'Mezcal',
  'Pisco', 'Aquavit', 'Genever', 'London dry gin', 'Old Tom gin', 'Absinthe',
  'Rum', 'Silver tequila']) CALORIE_MAP[s] = 2.3;

// Liqueurs (~25% ABV + sugar) → ~2.5 cal/ml
for (const s of ['Triple sec', 'Cointreau', 'Grand Marnier', 'Curaçao', 'Blue Curaçao',
  'Orange curaçao', 'Maraschino liqueur', 'Coffee liqueur', 'Elderflower liqueur',
  'Amaretto', 'Chartreuse', 'Green Chartreuse', 'Yellow Chartreuse', 'Bénédictine',
  'Galliano', 'Drambuie', 'Campari', 'Aperol', 'Cynar', 'Fernet-Branca',
  'Sloe gin', 'Gentiane liqueur', 'Falernum', 'Crème de cassis', 'Crème de violette',
  'Peach liqueur', 'Pear liqueur', 'Passion fruit liqueur', 'Blackberry liqueur',
  'Banana liqueur', 'Chocolate liqueur', 'Sour apple liqueur', 'Cherry Heering',
  'Midori', 'Chambord', 'Sambuca', 'Butterscotch schnapps', 'Peppermint schnapps',
  'Ancho Reyes', 'Allspice dram', 'Orgeat', "Pimm's No. 1", 'St-Germain',
  'Velvet Falernum', 'Créole Shrub']) CALORIE_MAP[s] = 2.5;

// Vermouth/aromatized wine (~18% ABV) → ~1.3 cal/ml
for (const s of ['Sweet vermouth', 'Dry vermouth', 'Blanc vermouth', 'Red vermouth',
  'Lillet Blanc', 'Sherry', 'Fino sherry', 'Port']) CALORIE_MAP[s] = 1.3;

// Sparkling/wine (~12% ABV) → ~0.9 cal/ml
for (const s of ['Prosecco', 'Champagne', 'Sparkling wine', 'White wine', 'Red wine',
  'Dry sparkling wine']) CALORIE_MAP[s] = 0.9;

// Beer → ~0.4 cal/ml
for (const s of ['Beer', 'Stout', 'Lager', 'Ginger beer']) CALORIE_MAP[s] = 0.4;

// Juices → ~0.4 cal/ml
for (const s of ['Lime juice', 'Lemon juice', 'Orange juice', 'Pineapple juice',
  'Grapefruit juice', 'Cranberry juice', 'Apple juice', 'Tomato juice',
  'Passion fruit juice', 'Pomegranate juice', 'Yuzu juice', 'Blood orange juice',
  'Watermelon juice', 'Celery juice', 'Carrot juice', 'Ginger juice']) CALORIE_MAP[s] = 0.4;

// Syrups → ~2.5 cal/ml
for (const s of ['Sugar syrup', 'Honey syrup', 'Agave syrup', 'Demerara syrup',
  'Grenadine', 'Raspberry syrup', 'Cinnamon syrup', 'Vanilla syrup', 'Ginger syrup',
  'Lavender syrup', 'Rose syrup', 'Maple syrup', 'Passion fruit syrup',
  'Pineapple syrup', 'Pineapple gum syrup', 'Elderflower syrup', 'Rosemary syrup',
  'Honey-ginger syrup', 'Hot honey syrup', 'Piloncillo syrup', 'Cane syrup']) CALORIE_MAP[s] = 2.5;

// Cream → ~3.4 cal/ml
for (const s of ['Heavy cream', 'Cream', 'Coconut cream', 'Baileys Irish Cream']) CALORIE_MAP[s] = 3.4;

// Soda/tonic → ~0.35 cal/ml
for (const s of ['Soda water', 'Tonic water', 'Cola', 'Ginger ale',
  'Lemon-lime soda', 'Grapefruit soda']) CALORIE_MAP[s] = 0.35;

// Coffee/tea → ~0.02 cal/ml
for (const s of ['Espresso', 'Coffee', 'Hot coffee', 'Tea', 'Hot water', 'Water']) CALORIE_MAP[s] = 0.02;

export function estimateCalories(ingredients: Ingredient[]): number {
  let total = 0;
  for (const ing of ingredients) {
    const amount = ing.amount || 0;
    if (ing.unit === 'ml') {
      const calPerMl = CALORIE_MAP[ing.name] ?? 1.5; // default: moderate estimate
      total += amount * calPerMl;
    } else if (ing.unit === 'dash') {
      total += amount * 1; // ~1 cal per dash
    } else if (ing.unit === 'barspoon') {
      const calPerMl = CALORIE_MAP[ing.name] ?? 1.5;
      total += amount * 5 * calPerMl; // 1 barspoon ≈ 5ml
    } else if (ing.name === 'Egg white') {
      total += amount * 17;
    } else if (ing.name === 'Whole egg' || ing.name === 'Egg') {
      total += amount * 72;
    } else if (ing.unit === 'piece' || ing.unit === 'slice' || ing.unit === 'leaves' || ing.unit === 'pinch') {
      total += amount * 2; // negligible
    }
  }
  return Math.round(total);
}
