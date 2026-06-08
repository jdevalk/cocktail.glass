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
      'Search the cocktail catalogue by name (substring, case- and ' +
      'diacritic-insensitive, so "carre" matches "Carré"). Returns up to 25 ' +
      'summary results — name, page URL, family, glassware — ranked exact ' +
      'match first, then prefix, then suffix, then any substring. Use this ' +
      'when the user names a drink (even fuzzily) and you want to confirm it ' +
      'exists or disambiguate similar names; once you have a single name, ' +
      'call get_cocktail_recipe for the full recipe. For ingredient-based ' +
      'discovery use find_cocktails_by_ingredient instead.',
    inputSchema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description:
            'Cocktail name or part of one — a single drink name, not an ' +
            'ingredient or category. Empty strings are rejected.',
        },
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
    name: 'list_cocktails',
    title: 'List cocktails',
    description:
      'List the whole catalogue: every cocktail as a summary (name, page ' +
      'URL, family, glassware), in catalogue order, optionally restricted ' +
      'to one drink family. Unlike search_cocktails and ' +
      'find_cocktails_by_ingredient — which cap their results and need a ' +
      'query — this takes no query and returns every matching cocktail, so ' +
      'use it to browse or enumerate the full set of 500 drinks (or a whole ' +
      'family) when there is nothing specific to search for. For one named ' +
      'drink use get_cocktail_recipe; to discover by ingredient use ' +
      'find_cocktails_by_ingredient.',
    inputSchema: {
      type: 'object',
      properties: {
        family: {
          type: 'string',
          description:
            'Optional drink family — one of: Spirit-Forward, Sour, ' +
            'Highball, Fizz & Collins, Spritz, Champagne Cocktail, Tiki, ' +
            'Punch, Flip & Nog, Hot Drink, Shot. Matched exactly (case- and ' +
            'diacritic-insensitive); an unknown family returns an empty ' +
            'list. Omit to list the entire catalogue.',
        },
      },
    },
    annotations: { readOnlyHint: true, openWorldHint: false },
    run(cocktails, args) {
      const fam = norm(args.family);
      const matches = (fam ? cocktails.filter((c) => norm(c.family) === fam) : cocktails).map(summary);
      return { count: matches.length, cocktails: matches };
    },
  },
  {
    name: 'get_cocktail_recipe',
    title: 'Get cocktail recipe',
    description:
      'Get the full recipe for one cocktail by name: ingredients with ' +
      'measures and units, preparation steps, garnish, glassware, family, ' +
      'page URL, and any film or TV appearances. Matching is case- and ' +
      'diacritic-insensitive: it tries an exact name match first, then falls ' +
      'back to the first substring match. Returns one cocktail object, or an ' +
      '{ error } if nothing matches. Use this when you have a specific drink ' +
      'name; if the name is ambiguous or you want a list, call ' +
      'search_cocktails first.',
    inputSchema: {
      type: 'object',
      properties: {
        name: {
          type: 'string',
          description:
            'The cocktail name. Exact is best (e.g. "Negroni"); partial ' +
            'names work but resolve to the first substring match, so prefer ' +
            'search_cocktails when the name is uncertain.',
        },
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
      'Find every cocktail in the catalogue that uses one specific ' +
      'ingredient. Matching is a case- and diacritic-insensitive substring ' +
      'match against each cocktail\'s ingredient names, so "gin" will also ' +
      'match "sloe gin" and "ginger beer" — use a more specific term if ' +
      'that matters. Returns up to 60 summary results (name, URL, family, ' +
      'glassware) in catalogue order. Takes one ingredient only; for ' +
      '"what can I make from X, Y, and Z?" use find_makeable_cocktails ' +
      'instead, which handles multiple ingredients and reports near-misses.',
    inputSchema: {
      type: 'object',
      properties: {
        ingredient: {
          type: 'string',
          description:
            'A single ingredient term — e.g. "gin", "lime juice", "Campari". ' +
            'One value only; passing a comma-separated list is treated as ' +
            'one literal string and will rarely match. Use ' +
            'find_makeable_cocktails for multi-ingredient queries.',
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
      'Find every cocktail that appears in a given film or TV show. ' +
      'Case- and diacritic-insensitive substring match against both the ' +
      'title and the scene description, so a character or actor works too — ' +
      'e.g. "Casablanca", "Bond", "Hemingway". Each result names the ' +
      'cocktail, the film/show title, the year, and the scene. Returns up ' +
      'to 60 appearances ordered oldest year first, then by cocktail name. ' +
      'A single cocktail can appear multiple times if it shows up in ' +
      'multiple scenes that match. Use this only for on-screen appearances; ' +
      'for a drink by name use search_cocktails, and to browse the whole ' +
      'catalogue use list_cocktails.',
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
      'available; soda and tonic water are not. Matching is word-based, not ' +
      'substring: "gin" matches "London dry gin" but not "ginger beer", and ' +
      'generic terms do not match product-class extras ("gin" will not ' +
      'cover "sloe gin" or "orange bitters"). Returns two lists: "makeable" ' +
      '(drinks you can make now, up to 60) and "almostMakeable" (drinks ' +
      'exactly one ingredient short, up to 25, each naming the missing ' +
      'ingredient). Drinks needing two or more extra ingredients are ' +
      'omitted entirely. Both lists are ordered simplest first — fewest ' +
      'distinct ingredients in the full recipe, then alphabetical by name. ' +
      'Use this for multi-ingredient "what can I make?" questions; for a ' +
      'single ingredient use find_cocktails_by_ingredient.',
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
      'Suggest one cocktail picked uniformly at random from the catalogue ' +
      '(or from one family if "family" is given) and return its full recipe — ' +
      'ingredients with measures, preparation steps, garnish, glassware, ' +
      'page URL, and any film or TV appearances. Each call returns an ' +
      'independent draw, so repeated calls give different drinks. The ' +
      '"family" filter matches the family name exactly (case- and ' +
      'diacritic-insensitive); if no cocktail matches that family the call ' +
      'silently falls back to the full catalogue rather than erroring. ' +
      'Use this only when the user wants a suggestion or inspiration with ' +
      'no specific drink in mind. For a named cocktail use ' +
      'get_cocktail_recipe; for "anything with gin" use ' +
      'find_cocktails_by_ingredient; for "what can I make from what I ' +
      'have" use find_makeable_cocktails.',
    inputSchema: {
      type: 'object',
      properties: {
        family: {
          type: 'string',
          description:
            'Optional drink family — one of: Spirit-Forward, Sour, ' +
            'Highball, Fizz & Collins, Spritz, Champagne Cocktail, Tiki, ' +
            'Punch, Flip & Nog, Hot Drink, Shot. Other values fall back to ' +
            'the full catalogue. Omit for an unrestricted random pick.',
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
