import cocktails from '../catalogue.mjs';

/**
 * Remote MCP (Model Context Protocol) server for cocktail.glass.
 *
 * A stateless Streamable HTTP endpoint — connect any MCP client to
 * https://cocktail.glass/mcp. Exposes the same six read-only tools as the
 * in-browser WebMCP integration (src/components/WebMcp.astro), so agents
 * without a browser (Claude Desktop, Claude Code, …) can query the catalogue.
 *
 * Stateless by design: no Mcp-Session-Id is issued and every POST is
 * self-contained, so it scales horizontally with no shared state.
 *
 * The tool names, schemas, and matching logic mirror the in-browser WebMCP
 * integration — keep this file and src/components/WebMcp.astro in sync.
 */

const SUPPORTED_PROTOCOL_VERSIONS = ['2025-11-25', '2025-06-18', '2025-03-26'];
const DEFAULT_PROTOCOL_VERSION = '2025-06-18';

const SERVER_INFO = {
  name: 'cocktail-glass',
  title: 'Cocktail Glass',
  version: '1.0.0',
};

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, MCP-Protocol-Version, Mcp-Session-Id',
  'Access-Control-Max-Age': '86400',
};

// --- Tool implementations -------------------------------------------------

// Lowercase + strip diacritics so "carre" matches "Carré".
function norm(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
}

function pageUrl(cocktail, origin) {
  return `${origin}/${cocktail.slug}/`;
}

function summary(cocktail, origin) {
  return {
    name: cocktail.name,
    url: pageUrl(cocktail, origin),
    family: cocktail.family,
    glass: cocktail.glass,
  };
}

function fullRecipe(cocktail, origin) {
  return { ...cocktail, url: pageUrl(cocktail, origin) };
}

// --- Ingredient matching (shared with src/components/WebMcp.astro) --------

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
const PRODUCT_CLASS_WORDS = new Set([
  'bitters', 'liqueur', 'schnapps', 'cordial', 'amaro', 'sloe',
]);

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

const TOOLS = [
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
    run(args, origin) {
      const q = norm(args.query);
      if (!q) return { error: 'Provide a search query.' };
      const matches = cocktails
        .filter((c) => norm(c.name).includes(q))
        .slice(0, 25)
        .map((c) => summary(c, origin));
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
    run(args, origin) {
      const q = norm(args.name);
      if (!q) return { error: 'Provide a cocktail name.' };
      const match =
        cocktails.find((c) => norm(c.name) === q) ||
        cocktails.find((c) => norm(c.name).includes(q));
      if (!match) return { error: `No cocktail found matching "${args.name || ''}".` };
      return fullRecipe(match, origin);
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
    run(args, origin) {
      const q = norm(args.ingredient);
      if (!q) return { error: 'Provide an ingredient name.' };
      const matches = cocktails
        .filter((c) => c.ingredients.some((i) => norm(i.name).includes(q)))
        .slice(0, 60)
        .map((c) => summary(c, origin));
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
    run(args, origin) {
      const q = norm(args.movie);
      if (!q) return { error: 'Provide a film or TV show title.' };
      const appearances = [];
      for (const c of cocktails) {
        for (const a of c.movieAppearances || []) {
          if (norm(a.movie).includes(q) || norm(a.note).includes(q)) {
            appearances.push({
              ...summary(c, origin),
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
    run(args, origin) {
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
          cocktails: makeable.slice(0, 60).map((m) => summary(m.c, origin)),
        },
        almostMakeable: {
          count: almost.length,
          cocktails: almost.slice(0, 25).map((m) => ({
            ...summary(m.c, origin),
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
    run(args, origin) {
      let pool = cocktails;
      const fam = norm(args.family);
      if (fam) {
        const filtered = cocktails.filter((c) => norm(c.family) === fam);
        if (filtered.length) pool = filtered;
      }
      return fullRecipe(pool[Math.floor(Math.random() * pool.length)], origin);
    },
  },
];

// --- Prompts --------------------------------------------------------------

// User-invokable prompt templates. Unlike tools (model-controlled), a prompt
// is chosen deliberately by the user — clients surface these as slash
// commands. Remote-only: the in-browser WebMCP integration carries tools,
// not prompts, so this list has no counterpart in src/components/WebMcp.astro.
const PROMPTS = [
  {
    name: 'cocktails_from_my_bar',
    title: 'Cocktails from my bar',
    description:
      'From a photo of your liquor cabinet — or a list of what you own — ' +
      'find every cocktail you can make right now.',
    arguments: [
      {
        name: 'notes',
        description:
          'Optional: anything not visible in the photo — fresh produce, ' +
          'mixers, or garnishes you also have on hand.',
        required: false,
      },
    ],
    build(args) {
      const extra = args && typeof args.notes === 'string' ? args.notes.trim() : '';
      const notesLine = extra
        ? `\n\nAlso available, not visible in the photo: ${extra}.`
        : '';
      return {
        description: 'Turn a photo of your bar into a list of makeable cocktails.',
        messages: [
          {
            role: 'user',
            content: {
              type: 'text',
              text:
                'I will share a photo of my liquor cabinet / home bar. Work ' +
                'through it step by step:\n\n' +
                '1. Identify every bottle and ingredient you can see — read the ' +
                'labels carefully.\n' +
                '2. Normalise each one to a generic ingredient name the catalogue ' +
                'will recognise. Map brands and specifics to their base type: ' +
                '"Bombay Sapphire" to "gin", "Cointreau" to "triple sec", ' +
                '"Martini Rosso" to "sweet vermouth", "Tanqueray No. Ten" to "gin".\n' +
                '3. Call the find_makeable_cocktails tool once, passing that full ' +
                'list of ingredients.\n' +
                '4. Show me the cocktails I can make right now, then a few I am ' +
                'one ingredient short of — name the missing ingredient for each. ' +
                'Link every cocktail to its recipe URL.' +
                notesLine +
                '\n\nIf I have not attached a photo yet, ask me for one first.',
            },
          },
        ],
      };
    },
  },
];

// --- JSON-RPC plumbing ----------------------------------------------------

function rpcResult(id, result) {
  return { jsonrpc: '2.0', id, result };
}

function rpcError(id, code, message) {
  return { jsonrpc: '2.0', id: id ?? null, error: { code, message } };
}

function handleRpc(message, origin) {
  if (!message || message.jsonrpc !== '2.0' || typeof message.method !== 'string') {
    return rpcError(message && message.id, -32600, 'Invalid Request');
  }

  const { id, method, params } = message;

  switch (method) {
    case 'initialize': {
      const requested = params && params.protocolVersion;
      const protocolVersion = SUPPORTED_PROTOCOL_VERSIONS.includes(requested)
        ? requested
        : DEFAULT_PROTOCOL_VERSION;
      return rpcResult(id, {
        protocolVersion,
        capabilities: { tools: {}, prompts: {} },
        serverInfo: SERVER_INFO,
        instructions:
          'Tools for cocktail.glass — a catalogue of 500 cocktail recipes. Use ' +
          'search_cocktails to find drinks by name, get_cocktail_recipe for a full ' +
          'recipe, find_cocktails_by_ingredient to search by a single ' +
          'ingredient, find_cocktails_in_movie to find drinks featured in a ' +
          'film or TV show, find_makeable_cocktails to find drinks you can make ' +
          'from a set of ingredients you have, and random_cocktail for a ' +
          'suggestion. The cocktails_from_my_bar prompt turns a photo of a ' +
          'home bar into a list of makeable cocktails.',
      });
    }

    case 'ping':
      return rpcResult(id, {});

    case 'tools/list':
      return rpcResult(id, {
        tools: TOOLS.map(({ name, title, description, inputSchema, annotations }) => ({
          name,
          title,
          description,
          inputSchema,
          annotations,
        })),
      });

    case 'tools/call': {
      const tool = TOOLS.find((t) => t.name === (params && params.name));
      if (!tool) {
        return rpcError(id, -32602, `Unknown tool: ${params && params.name}`);
      }
      try {
        const data = tool.run((params && params.arguments) || {}, origin);
        return rpcResult(id, {
          content: [{ type: 'text', text: JSON.stringify(data) }],
        });
      } catch (err) {
        return rpcResult(id, {
          content: [{ type: 'text', text: `Error running ${tool.name}: ${err}` }],
          isError: true,
        });
      }
    }

    case 'prompts/list':
      return rpcResult(id, {
        prompts: PROMPTS.map(({ name, title, description, arguments: argspec }) => ({
          name,
          title,
          description,
          arguments: argspec,
        })),
      });

    case 'prompts/get': {
      const prompt = PROMPTS.find((p) => p.name === (params && params.name));
      if (!prompt) {
        return rpcError(id, -32602, `Unknown prompt: ${params && params.name}`);
      }
      return rpcResult(id, prompt.build((params && params.arguments) || {}));
    }

    default:
      return rpcError(id, -32601, `Method not found: ${method}`);
  }
}

// --- HTTP handler ---------------------------------------------------------

export async function onRequest(context) {
  const { request } = context;

  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  // The Streamable HTTP spec requires HTTP 405 for GET when the server offers
  // no SSE stream. This server is stateless and request/response only.
  if (request.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405, headers: CORS_HEADERS });
  }

  let message;
  try {
    message = await request.json();
  } catch {
    return jsonResponse(rpcError(null, -32700, 'Parse error'), 400);
  }

  if (Array.isArray(message)) {
    return jsonResponse(rpcError(null, -32600, 'JSON-RPC batching is not supported'), 400);
  }

  // A JSON-RPC notification or response carries no id — acknowledge with 202.
  if (message == null || message.id === undefined) {
    return new Response(null, { status: 202, headers: CORS_HEADERS });
  }

  const origin = new URL(request.url).origin;
  const response = handleRpc(message, origin);
  logMcpCall(context, message, response);
  return jsonResponse(response, 200);
}

function jsonResponse(body, status) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
  });
}

// --- Usage logging --------------------------------------------------------

// Writes one data point per MCP call to the MCP_LOG Analytics Engine dataset,
// which the /admin/stats dashboard queries. Never throws.
//
// The stateless server has no sessions, so client identity is asymmetric:
// only `initialize` carries clientInfo (name/version); `tools/call` does not.
// Both shapes share one dataset — `initialize` rows give the client mix,
// `tools/call` rows give the tool mix and the actual query arguments.
function logMcpCall(context, message, response) {
  const dataset = context.env.MCP_LOG;
  if (!dataset) return; // binding not configured (local dev) — silently skip
  try {
    const method = (message && message.method) || '';
    if (!method || method === 'ping') return; // ping is keepalive noise

    const req = context.request;
    const params = (message && message.params) || {};

    // Channel attribution: an install URL like /mcp?ref=hackernews carries
    // its `ref` on every request, so launch-channel usage is distinguishable.
    let ref = '';
    try {
      ref = (new URL(req.url).searchParams.get('ref') || '').slice(0, 60);
    } catch {
      ref = '';
    }

    let toolName = '';
    let args = '';
    let clientName = '';
    let clientVersion = '';
    let isError = '';

    if (method === 'tools/call') {
      toolName = String(params.name || '');
      try {
        args = JSON.stringify(params.arguments || {}).slice(0, 500);
      } catch {
        args = '';
      }
      if (response && (response.error || (response.result && response.result.isError))) {
        isError = '1';
      }
    } else if (method === 'initialize') {
      const clientInfo = params.clientInfo || {};
      clientName = String(clientInfo.name || '');
      clientVersion = String(clientInfo.version || '');
    }

    const protocol =
      req.headers.get('mcp-protocol-version') ||
      (method === 'initialize' ? String(params.protocolVersion || '') : '');
    const identity = method === 'tools/call' && toolName ? toolName : method;

    dataset.writeDataPoint({
      blobs: [
        method, // blob1
        toolName, // blob2
        args, // blob3
        clientName, // blob4
        clientVersion, // blob5
        protocol, // blob6
        (req.headers.get('user-agent') || '').slice(0, 300), // blob7
        req.cf?.country || '', // blob8
        isError, // blob9
        'remote', // blob10 surface (vs 'webmcp' from functions/api/webmcp-usage.js)
        ref, // blob11 channel ref from /mcp?ref=... install URLs
      ],
      indexes: [identity],
    });
  } catch {
    // Never break a request because logging failed.
  }
}
