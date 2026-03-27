export interface Ingredient {
  name: string;
  amount: string;
  unit: string;
}

export interface Cocktail {
  name: string;
  slug: string;
  category: string;
  glass: string;
  ingredients: Ingredient[];
  garnish: string;
  preparation: string;
}

export interface CocktailSummary {
  name: string;
  slug: string;
  category: string;
  glass: string;
  ingredients: string[];
}

export interface CocktailOriginStory {
  story: string;
  sourceName?: string;
  sourceUrl?: string;
}

export type CocktailOriginStories = Record<string, CocktailOriginStory>;
