import cocktails from '../catalogue.mjs';
import { TOOLS } from '../cocktail-tools.mjs';

/**
 * Remote MCP (Model Context Protocol) server for cocktail.glass.
 *
 * A stateless Streamable HTTP endpoint — connect any MCP client to
 * https://cocktail.glass/mcp. It exposes six read-only tools over the
 * cocktail catalogue.
 *
 * The tool names, schemas, descriptions, and matching logic live in
 * ../cocktail-tools.mjs and are shared verbatim with the in-browser WebMCP
 * integration (src/components/WebMcp.astro). This file is only the JSON-RPC
 * transport adapter; that file is only the navigator.modelContext adapter.
 *
 * Stateless by design: no Mcp-Session-Id is issued and every POST is
 * self-contained, so it scales horizontally with no shared state.
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

// --- Catalogue ------------------------------------------------------------

// The shared tools expect every cocktail to carry its canonical page URL.
// That URL depends on the request origin (production, preview, localhost),
// so it is stamped per origin and memoised. The catalogue is baked in at
// build time, so a stamped copy stays valid for the lifetime of the isolate.
const catalogueByOrigin = new Map();

function catalogueFor(origin) {
  let stamped = catalogueByOrigin.get(origin);
  if (!stamped) {
    stamped = cocktails.map((c) => ({ ...c, url: `${origin}/${c.slug}/` }));
    catalogueByOrigin.set(origin, stamped);
  }
  return stamped;
}

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
        const data = tool.run(catalogueFor(origin), (params && params.arguments) || {});
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
