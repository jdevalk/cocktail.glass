import { useState, useMemo } from 'preact/hooks';
import type { Cocktail } from '../types';

type FilterState = 'include' | 'exclude';
type FilterMap = Map<string, FilterState>;
type FilterContext = {
  categoryFilters?: FilterMap;
  glassFilters?: FilterMap;
  ingredientFilters?: FilterMap;
};

interface Props {
  cocktails: Cocktail[];
}

function getIncludedValues(filters: FilterMap): string[] {
  return [...filters.entries()].filter(([, state]) => state === 'include').map(([value]) => value);
}

function getExcludedValues(filters: FilterMap): string[] {
  return [...filters.entries()].filter(([, state]) => state === 'exclude').map(([value]) => value);
}

function matchesValueFilters(value: string, filters: FilterMap): boolean {
  const included = getIncludedValues(filters);
  const excluded = getExcludedValues(filters);

  if (included.length > 0 && !included.includes(value)) return false;
  if (excluded.includes(value)) return false;

  return true;
}

function matchesIngredientFilters(cocktail: Cocktail, filters: FilterMap): boolean {
  const included = getIncludedValues(filters);
  const excluded = getExcludedValues(filters);
  const cocktailIngredients = new Set(cocktail.ingredients.map((ingredient) => ingredient.name));

  for (const ingredient of included) {
    if (!cocktailIngredients.has(ingredient)) return false;
  }

  for (const ingredient of excluded) {
    if (cocktailIngredients.has(ingredient)) return false;
  }

  return true;
}

function matchesCocktail(cocktail: Cocktail, filters: FilterContext): boolean {
  if (filters.categoryFilters && !matchesValueFilters(cocktail.category, filters.categoryFilters)) return false;
  if (filters.glassFilters && !matchesValueFilters(cocktail.glass, filters.glassFilters)) return false;
  if (filters.ingredientFilters && !matchesIngredientFilters(cocktail, filters.ingredientFilters)) return false;

  return true;
}

function countValues(values: string[]): Map<string, number> {
  const counts = new Map<string, number>();

  for (const value of values) {
    counts.set(value, (counts.get(value) || 0) + 1);
  }

  return counts;
}

function FilterPill({ label, state, count, onToggle }: {
  label: string;
  state: FilterState | null;
  count: number;
  onToggle: (newState: FilterState | null) => void;
}) {
  const cls = state === 'include' ? 'pill--include' : state === 'exclude' ? 'pill--exclude' : '';

  function handleClick(e: MouseEvent) {
    e.preventDefault();
    // Cycle: off -> include -> exclude -> off
    if (state === null) onToggle('include');
    else if (state === 'include') onToggle('exclude');
    else onToggle(null);
  }

  return (
    <button onClick={handleClick} class={`pill ${cls}`}>
      {state === 'include' && <span class="pill-sign">+</span>}
      {state === 'exclude' && <span class="pill-sign">&minus;</span>}
      {label} <span class="pill-count">{count}</span>
    </button>
  );
}

function CocktailCard({ cocktail }: { cocktail: Cocktail }) {
  return (
    <a href={`/${cocktail.slug}/`} class="card">
      <div class="card-image-frame">
        <img
          src={`/images/${cocktail.slug}.webp`}
          alt={cocktail.name}
          class="card-image"
          loading="lazy"
          decoding="async"
          onError={(e) => {
            (e.currentTarget.parentElement as HTMLDivElement | null)?.classList.add('card-image-frame--empty');
          }}
        />
      </div>
      <span class="card-category">{cocktail.category}</span>
      <h3 class="card-name">{cocktail.name}</h3>
      <p class="card-meta">{cocktail.glass} &middot; {cocktail.ingredients.length} ingredients</p>
    </a>
  );
}

export default function CocktailGrid({ cocktails }: Props) {
  const [categoryFilters, setCategoryFilters] = useState<FilterMap>(new Map());
  const [glassFilters, setGlassFilters] = useState<FilterMap>(new Map());
  const [ingredientFilters, setIngredientFilters] = useState<FilterMap>(new Map());
  const [ingredientSearch, setIngredientSearch] = useState('');
  const [showAllIngredients, setShowAllIngredients] = useState(false);
  const [activeTab, setActiveTab] = useState<'category' | 'glass' | 'ingredients'>('category');

  const categoryOptions = useMemo(() => {
    return [...countValues(cocktails.map((cocktail) => cocktail.category)).entries()].sort((a, b) => b[1] - a[1]);
  }, [cocktails]);

  const glassOptions = useMemo(() => {
    return [...countValues(cocktails.map((cocktail) => cocktail.glass)).entries()].sort((a, b) => b[1] - a[1]);
  }, [cocktails]);

  const ingredientOptions = useMemo(() => {
    const counts = countValues(
      cocktails.flatMap((cocktail) => [...new Set(cocktail.ingredients.map((ingredient) => ingredient.name))]),
    );

    return [...counts.entries()].sort((a, b) => b[1] - a[1]);
  }, [cocktails]);

  const filtered = useMemo(() => {
    return cocktails.filter((cocktail) => matchesCocktail(cocktail, {
      categoryFilters,
      glassFilters,
      ingredientFilters,
    }));
  }, [cocktails, categoryFilters, glassFilters, ingredientFilters]);

  const categoryCounts = useMemo(() => {
    return countValues(filtered.map((cocktail) => cocktail.category));
  }, [filtered]);

  const glassCounts = useMemo(() => {
    return countValues(filtered.map((cocktail) => cocktail.glass));
  }, [filtered]);

  const ingredientCounts = useMemo(() => {
    return countValues(
      filtered.flatMap((cocktail) => [...new Set(cocktail.ingredients.map((ingredient) => ingredient.name))]),
    );
  }, [filtered]);

  const visibleCategories = useMemo(() => {
    return categoryOptions;
  }, [categoryOptions]);

  const visibleGlasses = useMemo(() => {
    return glassOptions.filter(([glass]) => (glassCounts.get(glass) ?? 0) > 0 || glassFilters.has(glass));
  }, [glassOptions, glassCounts, glassFilters]);

  const availableIngredientOptions = useMemo(() => {
    return ingredientOptions.filter(([ingredient]) => (ingredientCounts.get(ingredient) ?? 0) > 0 || ingredientFilters.has(ingredient));
  }, [ingredientOptions, ingredientCounts, ingredientFilters]);

  const visibleIngredients = useMemo(() => {
    if (ingredientSearch) {
      const q = ingredientSearch.toLowerCase();
      return availableIngredientOptions.filter(([name]) => ingredientFilters.has(name) || name.toLowerCase().includes(q));
    }

    if (showAllIngredients) {
      return availableIngredientOptions;
    }

    const limitedIngredients: typeof availableIngredientOptions = [];

    for (const ingredient of availableIngredientOptions) {
      const [name] = ingredient;
      if (limitedIngredients.length < 20 || ingredientFilters.has(name)) {
        limitedIngredients.push(ingredient);
      }
    }

    return limitedIngredients;
  }, [availableIngredientOptions, ingredientFilters, ingredientSearch, showAllIngredients]);

  const grouped = useMemo(() => {
    const map = new Map<string, Cocktail[]>();
    for (const c of filtered) {
      const arr = map.get(c.category) || [];
      arr.push(c);
      map.set(c.category, arr);
    }
    return map;
  }, [filtered]);

  function toggleFilter(setter: (fn: (prev: FilterMap) => FilterMap) => void, key: string, newState: FilterState | null) {
    setter(prev => {
      const next = new Map(prev);
      if (newState === null) next.delete(key);
      else next.set(key, newState);
      return next;
    });
  }

  function clearAll() {
    setCategoryFilters(new Map());
    setGlassFilters(new Map());
    setIngredientFilters(new Map());
    setIngredientSearch('');
  }

  function filterCount(filters: FilterMap): number {
    return filters.size;
  }

  const hasFilters = categoryFilters.size > 0 || glassFilters.size > 0 || ingredientFilters.size > 0;

  return (
    <div>
      <div class="filters">
        <div class="filter-tabs">
          <div class="filter-tabs-left">
            <button
              class={`filter-tab ${activeTab === 'category' ? 'filter-tab--active' : ''}`}
              onClick={() => setActiveTab('category')}
            >
              Category
              {filterCount(categoryFilters) > 0 && (
                <span class="filter-badge">{filterCount(categoryFilters)}</span>
              )}
            </button>
            <button
              class={`filter-tab ${activeTab === 'glass' ? 'filter-tab--active' : ''}`}
              onClick={() => setActiveTab('glass')}
            >
              Glass type
              {filterCount(glassFilters) > 0 && (
                <span class="filter-badge">{filterCount(glassFilters)}</span>
              )}
            </button>
            <button
              class={`filter-tab ${activeTab === 'ingredients' ? 'filter-tab--active' : ''}`}
              onClick={() => setActiveTab('ingredients')}
            >
              Ingredients
              {filterCount(ingredientFilters) > 0 && (
                <span class="filter-badge">{filterCount(ingredientFilters)}</span>
              )}
            </button>
          </div>
        </div>
        <div class="filter-hint" aria-hidden="true">
          <span class="filter-hint-pill">
            <span class="filter-hint-sign">+</span>
            Include
          </span>
          <span class="filter-hint-separator">•</span>
          <span>Tap again to exclude</span>
        </div>

        <div class="filter-panel">
          {activeTab === 'category' && (
            <div class="pill-group">
              {visibleCategories.map(([cat]) => (
                <FilterPill
                  key={cat}
                  label={cat}
                  count={categoryCounts.get(cat) ?? 0}
                  state={categoryFilters.get(cat) ?? null}
                  onToggle={(s) => toggleFilter(setCategoryFilters, cat, s)}
                />
              ))}
            </div>
          )}

          {activeTab === 'glass' && (
            <div class="pill-group">
              {visibleGlasses.map(([glass]) => (
                <FilterPill
                  key={glass}
                  label={glass}
                  count={glassCounts.get(glass) ?? 0}
                  state={glassFilters.get(glass) ?? null}
                  onToggle={(s) => toggleFilter(setGlassFilters, glass, s)}
                />
              ))}
            </div>
          )}

          {activeTab === 'ingredients' && (
            <>
              <input
                type="text"
                class="ingredient-search"
                placeholder="Search ingredients..."
                value={ingredientSearch}
                onInput={(e) => {
                  setIngredientSearch((e.target as HTMLInputElement).value);
                }}
              />
              <div class="pill-group">
                {visibleIngredients.map(([ing]) => (
                  <FilterPill
                    key={ing}
                    label={ing}
                    count={ingredientCounts.get(ing) ?? 0}
                    state={ingredientFilters.get(ing) ?? null}
                    onToggle={(s) => toggleFilter(setIngredientFilters, ing, s)}
                  />
                ))}
              </div>
              {!ingredientSearch && !showAllIngredients && availableIngredientOptions.length > 20 && (
                <button class="show-more" onClick={() => setShowAllIngredients(true)}>
                  Show all {availableIngredientOptions.length} ingredients
                </button>
              )}
              {!ingredientSearch && showAllIngredients && (
                <button class="show-more" onClick={() => setShowAllIngredients(false)}>
                  Show fewer
                </button>
              )}
            </>
          )}
        </div>

        {hasFilters && (
          <div class="filter-status">
            <span class="result-count">
              {filtered.length} cocktail{filtered.length !== 1 ? 's' : ''} found
            </span>
            <button class="clear-btn" onClick={clearAll}>Clear filters</button>
          </div>
        )}
      </div>

      {[...grouped.entries()].map(([category, items]) => (
        <section class="category-section" key={category}>
          <div class="section-header">
            <h2 class="section-title">{category}</h2>
            <span class="count">{items.length} recipe{items.length !== 1 ? 's' : ''}</span>
          </div>
          <div class="grid">
            {items.map(cocktail => (
              <CocktailCard key={cocktail.slug} cocktail={cocktail} />
            ))}
          </div>
        </section>
      ))}

      {filtered.length === 0 && (
        <div class="empty">
          <p>No cocktails match those filters.</p>
          <button class="clear-btn" onClick={clearAll}>Clear filters</button>
        </div>
      )}
    </div>
  );
}
