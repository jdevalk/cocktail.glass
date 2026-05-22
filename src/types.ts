export interface Ingredient {
  ref: string;
  name: string;
  type: string;
  amount: number;
  unit: string;
}

export interface IngredientDef {
  id: string;
  name: string;
  type: string;
  aliases: string[];
}

export interface MovieAppearance {
  movie: string;
  year: number;
  note: string;
  source?: string;
}

export interface Cocktail {
  name: string;
  slug: string;
  glass: string;
  family: string;
  method: string;
  tags: string[];
  ingredients: Ingredient[];
  garnish: string[];
  preparation: string[];
  movieAppearances?: MovieAppearance[];
}

export interface CocktailSummary {
  name: string;
  slug: string;
  family: string;
  glass: string;
  ingredients: string[];
}

export interface CocktailOriginStory {
  story: string;
  sourceName?: string;
  sourceUrl?: string;
}

export type CocktailOriginStories = Record<string, CocktailOriginStory>;
