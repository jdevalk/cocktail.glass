import cocktails from '../cocktails.json';

/**
 * Remote MCP (Model Context Protocol) server for cocktail.glass.
 *
 * A stateless Streamable HTTP endpoint — connect any MCP client to
 * https://cocktail.glass/mcp. Exposes the same four read-only tools as the
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
    category: cocktail.category,
    glass: cocktail.glass,
  };
}

function fullRecipe(cocktail, origin) {
  return { ...cocktail, url: pageUrl(cocktail, origin) };
}

const TOOLS = [
  {
    name: 'search_cocktails',
    title: 'Search cocktails',
    description:
      'Search the cocktail catalogue by name. Returns matching cocktails with their page URLs, category, and glassware.',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Cocktail name or part of a name' },
      },
      required: ['query'],
    },
    annotations: { readOnlyHint: true },
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
      'Get the full recipe for a cocktail by name: ingredients with measures, preparation steps, garnish, glassware, and page URL.',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'The cocktail name' },
      },
      required: ['name'],
    },
    annotations: { readOnlyHint: true },
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
    annotations: { readOnlyHint: true },
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
    name: 'random_cocktail',
    title: 'Random cocktail',
    description:
      'Suggest a random cocktail and return its full recipe. Optionally restrict to a category.',
    inputSchema: {
      type: 'object',
      properties: {
        category: {
          type: 'string',
          description:
            'Optional category, e.g. Classic, Highball, Sour, Modern Classic, Tiki, Spritz, Frozen, Fizz, Champagne Cocktail, Martini Variation, Hot Drink, Punch, Low alcohol, Shooter, Stirred, No alcohol',
        },
      },
    },
    annotations: { readOnlyHint: true },
    run(args, origin) {
      let pool = cocktails;
      const cat = norm(args.category);
      if (cat) {
        const filtered = cocktails.filter((c) => norm(c.category) === cat);
        if (filtered.length) pool = filtered;
      }
      return fullRecipe(pool[Math.floor(Math.random() * pool.length)], origin);
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
        capabilities: { tools: {} },
        serverInfo: SERVER_INFO,
        instructions:
          'Tools for cocktail.glass — a catalogue of 500 cocktail recipes. Use ' +
          'search_cocktails to find drinks by name, get_cocktail_recipe for a full ' +
          'recipe, find_cocktails_by_ingredient to search by ingredient, and ' +
          'random_cocktail for a suggestion.',
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
      ],
      indexes: [identity],
    });
  } catch {
    // Never break a request because logging failed.
  }
}
