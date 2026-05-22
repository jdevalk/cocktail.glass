/**
 * Cocktail tool definitions — the shared core behind both MCP surfaces.
 *
 * cocktail.glass exposes the same six read-only tools two ways: a remote MCP
 * server (functions/mcp.js, JSON-RPC over HTTP) and an in-browser WebMCP
 * integration (src/components/WebMcp.astro, navigator.modelContext). This
 * module is the one place the tool names, schemas, descriptions, and matching
 * logic are written down. Each surface is a thin transport adapter over it.
 *
 * Every `run(cocktails, args)` is a pure, synchronous function:
 *   - `cocktails` is the catalogue array, each record already carrying a
 *     `url` field. The remote server stamps URLs from the request origin;
 *     the browser gets them pre-baked in /cocktails.json. Neither concern
 *     reaches this file.
 *   - it returns a plain data object, which the adapter wraps for its
 *     transport. A validation failure returns `{ error }` rather than
 *     throwing.
 *
 * No I/O, no transport, no request origin — keep it that way so both
 * runtimes can import it unchanged.
 */

// Lowercase + strip diacritics so "carre" matches "Carré".
function norm(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
}

// The compact shape returned by every listing tool.
function summary(cocktail) {
  return {
    name: cocktail.name,
    url: cocktail.url,
    family: cocktail.family,
    glass: cocktail.glass,
  };
}

// --- Ingredient matching --------------------------------------------------

// Normalised word tokens of an ingredient name, e.g. "London dry gin" ->
// ["london","dry","gin"]. Tokenising avoids substring traps like "gin"
// matching "ginger beer".
function words(value) {
  return norm(value)
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

// Words that mark a distinct product: a generic user term ("orange", "gin")
// must not loosely match a more specific catalogue name ("orange bitters",
// "sloe gin") — those are separate bottles, not had from the base spirit.
const PRODUCT_CLASS_WORDS = new Set(['bitters', 'liqueur', 'schnapps', 'cordial', 'amaro', 'sloe']);

// Plain water is assumed always on hand; soda/tonic water are not.
const ASSUMED_STAPLES = new Set(['water', 'hot water', 'still water', 'branch water']);

function wordsSubset(a, b) {
  return a.every((w) => b.includes(w));
}

// Does a user-supplied ingredient term cover a catalogue ingredient name?
function userTermCovers(userWords, ingWords) {
  if (ingWords.length === 0 || userWords.length === 0) return false;
  // Catalogue term is generic, user term at least as specific.
  if (wordsSubset(ingWords, userWords)) return true;
  // User term is generic, catalogue term more specific ("gin" -> "London dry
  // gin") — allowed unless the extra words name a different product class.
  if (wordsSubset(userWords, ingWords)) {
    const extra = ingWords.filter((w) => !userWords.includes(w));
    return !extra.some((w) => PRODUCT_CLASS_WORDS.has(w));
  }
  return false;
}

// --- Tools ----------------------------------------------------------------

export const TOOLS = [
  {
    name: 'search_cocktails',
    title: 'Search cocktails',
    description:
      'Search the cocktail catalogue by name. Returns matching cocktails with their page URLs, family, and glassware.',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Cocktail name or part of a name' },
      },
      required: ['query'],
    },
    annotations: { readOnlyHint: true, openWorldHint: false },
    run(cocktails, args) {
      const q = norm(args.query);
      if (!q) return { error: 'Provide a search query.' };
      const matches = cocktails
        .filter((c) => norm(c.name).includes(q))
        .slice(0, 25)
        .map(summary);
      return { count: matches.length, cocktails: matches };
    },
  },
  {
    name: 'get_cocktail_recipe',
    title: 'Get cocktail recipe',
    description:
      'Get the full recipe for a cocktail by name: ingredients with measures, preparation steps, garnish, glassware, page URL, and any film or TV appearances.',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'The cocktail name' },
      },
      required: ['name'],
    },
    annotations: { readOnlyHint: true, openWorldHint: false },
    run(cocktails, args) {
      const q = norm(args.name);
      if (!q) return { error: 'Provide a cocktail name.' };
      const match =
        cocktails.find((c) => norm(c.name) === q) ||
        cocktails.find((c) => norm(c.name).includes(q));
      if (!match) return { error: `No cocktail found matching "${args.name || ''}".` };
      return match;
    },
  },
  {
    name: 'find_cocktails_by_ingredient',
    title: 'Find cocktails by ingredient',
    description:
      'Find every cocktail that uses a given ingredient (spirit, juice, liqueur, etc.). Useful for "what can I make with ..." questions.',
    inputSchema: {
      type: 'object',
      properties: {
        ingredient: {
          type: 'string',
          description: 'An ingredient name, e.g. "gin" or "lime juice"',
        },
      },
      required: ['ingredient'],
    },
    annotations: { readOnlyHint: true, openWorldHint: false },
    run(cocktails, args) {
      const q = norm(args.ingredient);
      if (!q) return { error: 'Provide an ingredient name.' };
      const matches = cocktails
        .filter((c) => c.ingredients.some((i) => norm(i.name).includes(q)))
        .slice(0, 60)
        .map(summary);
      return { count: matches.length, cocktails: matches };
    },
  },
  {
    name: 'find_cocktails_in_movie',
    title: 'Find cocktails in a movie',
    description:
      'Find every cocktail that appears in a given film or TV show. Match is ' +
      'on the title or the scene description, so a character or actor works ' +
      'too — e.g. "Casablanca", "Bond", "Hemingway". Each result names ' +
      'the cocktail, the title, the year, and the scene.',
    inputSchema: {
      type: 'object',
      properties: {
        movie: {
          type: 'string',
          description: 'A film or TV show title, full or partial',
        },
      },
      required: ['movie'],
    },
    annotations: { readOnlyHint: true, openWorldHint: false },
    run(cocktails, args) {
      const q = norm(args.movie);
      if (!q) return { error: 'Provide a film or TV show title.' };
      const appearances = [];
      for (const c of cocktails) {
        for (const a of c.movieAppearances || []) {
          if (norm(a.movie).includes(q) || norm(a.note).includes(q)) {
            appearances.push({
              ...summary(c),
              movie: a.movie,
              year: a.year,
              note: a.note,
            });
          }
        }
      }
      appearances.sort((a, b) => a.year - b.year || a.name.localeCompare(b.name));
      return { count: appearances.length, appearances: appearances.slice(0, 60) };
    },
  },
  {
    name: 'find_makeable_cocktails',
    title: 'Find makeable cocktails',
    description:
      'Given the ingredients you have on hand, find every cocktail you can ' +
      'make completely — one where you already have all of its ingredients. ' +
      'Garnishes are treated as optional and plain water is assumed ' +
      'available. Returns two lists: "makeable" (drinks you can make now) and ' +
      '"almostMakeable" (drinks one ingredient short, each naming the missing ' +
      'ingredient). Both are ordered simplest drink first.',
    inputSchema: {
      type: 'object',
      properties: {
        ingredients: {
          type: 'array',
          items: { type: 'string' },
          description:
            'The ingredients you have available — spirits, liqueurs, juices, ' +
            'mixers, etc. e.g. ["gin", "sweet vermouth", "Campari", "lime"]',
        },
      },
      required: ['ingredients'],
    },
    annotations: { readOnlyHint: true, openWorldHint: false },
    run(cocktails, args) {
      const list = Array.isArray(args.ingredients) ? args.ingredients : [];
      const userWordSets = list.map((item) => words(item)).filter((w) => w.length > 0);
      if (userWordSets.length === 0) return { error: 'Provide at least one ingredient.' };

      const covered = (ingName) => {
        if (ASSUMED_STAPLES.has(norm(ingName))) return true;
        const iw = words(ingName);
        return userWordSets.some((uw) => userTermCovers(uw, iw));
      };

      const makeable = [];
      const almost = [];
      for (const c of cocktails) {
        const required = [...new Set(c.ingredients.map((i) => i.name))];
        const missing = required.filter((name) => !covered(name));
        if (missing.length === 0) makeable.push({ c, required: required.length });
        else if (missing.length === 1) almost.push({ c, required: required.length, missing });
      }

      const simplest = (a, b) => a.required - b.required || a.c.name.localeCompare(b.c.name);
      makeable.sort(simplest);
      almost.sort(simplest);

      return {
        makeable: {
          count: makeable.length,
          cocktails: makeable.slice(0, 60).map((m) => summary(m.c)),
        },
        almostMakeable: {
          count: almost.length,
          cocktails: almost.slice(0, 25).map((m) => ({
            ...summary(m.c),
            missing: m.missing,
          })),
        },
      };
    },
  },
  {
    name: 'random_cocktail',
    title: 'Random cocktail',
    description:
      'Suggest a random cocktail and return its full recipe. Optionally restrict to a drink family.',
    inputSchema: {
      type: 'object',
      properties: {
        family: {
          type: 'string',
          description:
            'Optional drink family, e.g. Spirit-Forward, Sour, Highball, Fizz & Collins, Spritz, Champagne Cocktail, Tiki, Punch, Flip & Nog, Hot Drink, Shot',
        },
      },
    },
    annotations: { readOnlyHint: true, openWorldHint: false },
    run(cocktails, args) {
      let pool = cocktails;
      const fam = norm(args.family);
      if (fam) {
        const filtered = cocktails.filter((c) => norm(c.family) === fam);
        if (filtered.length) pool = filtered;
      }
      return pool[Math.floor(Math.random() * pool.length)];
    },
  },
];

export default TOOLS;
