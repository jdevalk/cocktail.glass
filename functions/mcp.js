import cocktails from '../catalogue.mjs';
import { TOOLS } from '../cocktail-tools.mjs';

/**
 * Remote MCP (Model Context Protocol) server for cocktail.glass.
 *
 * A stateless Streamable HTTP endpoint — connect any MCP client to
 * https://cocktail.glass/mcp. It exposes seven read-only tools over the
 * cocktail catalogue.
 *
 * The tool names, schemas, descriptions, and matching logic live in
 * ../cocktail-tools.mjs and are shared verbatim with the in-browser WebMCP
 * integration (src/components/WebMcp.astro). This file is only the JSON-RPC
 * transport adapter; that file is only the navigator.modelContext adapter.
 *
 * Stateless by design: no Mcp-Session-Id is issued and every POST is
 * self-contained, so it scales horizontally with no shared state.
 *
 * Dual-era (MCP 2026-07-28): modern clients skip the initialize handshake
 * and carry protocol version + clientInfo in _meta on every request; legacy
 * clients (2025-11-25 and earlier) still open with initialize. Both are
 * answered on this endpoint per the spec's dual-era compatibility matrix,
 * for at least the twelve-month deprecation window.
 */

const MODERN_PROTOCOL_VERSION = '2026-07-28';
const LEGACY_PROTOCOL_VERSIONS = ['2025-11-25', '2025-06-18', '2025-03-26'];
const SUPPORTED_PROTOCOL_VERSIONS = [MODERN_PROTOCOL_VERSION, ...LEGACY_PROTOCOL_VERSIONS];
const DEFAULT_PROTOCOL_VERSION = '2025-06-18';

// _meta keys defined by the 2026-07-28 spec.
const META_VERSION = 'io.modelcontextprotocol/protocolVersion';
const META_CLIENT_INFO = 'io.modelcontextprotocol/clientInfo';
const META_SERVER_INFO = 'io.modelcontextprotocol/serverInfo';

// Cache hints for list results and server/discover. The catalogue, tools,
// and prompts only change on deploy, so shared caches may hold them a day.
const LIST_TTL_MS = 86_400_000;

// MCP error codes from the 2026-07-28 error code allocation policy.
const ERR_HEADER_MISMATCH = -32020;
const ERR_UNSUPPORTED_PROTOCOL_VERSION = -32022;

const SERVER_INFO = {
  name: 'cocktail-glass',
  title: 'Cocktail Glass',
  version: '1.1.0',
};

const SERVER_INSTRUCTIONS =
  'Tools for cocktail.glass — a catalogue of 500 cocktail recipes. Use ' +
  'search_cocktails to find drinks by name, list_cocktails to browse ' +
  'the whole catalogue (or one family), get_cocktail_recipe for a full ' +
  'recipe, find_cocktails_by_ingredient to search by a single ' +
  'ingredient, find_cocktails_in_movie to find drinks featured in a ' +
  'film or TV show, find_makeable_cocktails to find drinks you can make ' +
  'from a set of ingredients you have, and random_cocktail for a ' +
  'suggestion. The cocktails_from_my_bar prompt turns a photo of a ' +
  'home bar into a list of makeable cocktails.';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers':
    'Content-Type, MCP-Protocol-Version, Mcp-Session-Id, Mcp-Method, Mcp-Name',
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

function requestMeta(message) {
  return (message && message.params && message.params._meta) || {};
}

function isModern(message) {
  return typeof requestMeta(message)[META_VERSION] === 'string';
}

// Modern results carry a required resultType and the server's identity in
// _meta (there is no handshake to send it once). Legacy results keep the
// exact pre-2026 shape.
function rpcResult(id, result, modern = false) {
  const body = modern
    ? { ...result, resultType: 'complete', _meta: { [META_SERVER_INFO]: SERVER_INFO } }
    : result;
  return { jsonrpc: '2.0', id, result: body };
}

function rpcError(id, code, message, data) {
  const error = data === undefined ? { code, message } : { code, message, data };
  return { jsonrpc: '2.0', id: id ?? null, error };
}

// Transport-level validation for modern (2026-07-28+) requests. Legacy
// requests (no _meta protocol version) skip all of this. Returns a
// { status, body } rejection or null. Header checks are mismatch-strict but
// presence-lenient: a missing header never rejects, a contradicting one
// always does.
function validateModernTransport(request, message) {
  const bodyVersion = requestMeta(message)[META_VERSION];
  if (typeof bodyVersion !== 'string') return null;

  const id = (message && message.id) ?? null;

  const headerVersion = request.headers.get('mcp-protocol-version');
  if (headerVersion && headerVersion !== bodyVersion) {
    return {
      status: 400,
      body: rpcError(
        id,
        ERR_HEADER_MISMATCH,
        `MCP-Protocol-Version header (${headerVersion}) does not match _meta protocol version (${bodyVersion})`
      ),
    };
  }

  if (!SUPPORTED_PROTOCOL_VERSIONS.includes(bodyVersion)) {
    return {
      status: 400,
      body: rpcError(id, ERR_UNSUPPORTED_PROTOCOL_VERSION, 'Unsupported protocol version', {
        supported: SUPPORTED_PROTOCOL_VERSIONS,
        requested: bodyVersion,
      }),
    };
  }

  const headerMethod = request.headers.get('mcp-method');
  if (headerMethod && headerMethod !== message.method) {
    return {
      status: 400,
      body: rpcError(
        id,
        ERR_HEADER_MISMATCH,
        `Mcp-Method header (${headerMethod}) does not match method (${message.method})`
      ),
    };
  }

  const headerName = request.headers.get('mcp-name');
  const namedMethods = ['tools/call', 'prompts/get'];
  const bodyName = message.params && message.params.name;
  if (headerName && namedMethods.includes(message.method) && headerName !== bodyName) {
    return {
      status: 400,
      body: rpcError(
        id,
        ERR_HEADER_MISMATCH,
        `Mcp-Name header (${headerName}) does not match name (${bodyName})`
      ),
    };
  }

  return null;
}

function handleRpc(message, origin) {
  if (!message || message.jsonrpc !== '2.0' || typeof message.method !== 'string') {
    return rpcError(message && message.id, -32600, 'Invalid Request');
  }

  const { id, method, params } = message;
  const modern = isModern(message);

  switch (method) {
    // Answered for both eras: dual-era clients probe with this.
    case 'server/discover':
      return rpcResult(id, {
        resultType: 'complete',
        supportedVersions: SUPPORTED_PROTOCOL_VERSIONS,
        capabilities: { tools: {}, prompts: {} },
        instructions: SERVER_INSTRUCTIONS,
        ttlMs: LIST_TTL_MS,
        cacheScope: 'public',
        _meta: { [META_SERVER_INFO]: SERVER_INFO },
      });

    // Legacy handshake — kept for pre-2026-07-28 clients.
    case 'initialize': {
      const requested = params && params.protocolVersion;
      const protocolVersion = LEGACY_PROTOCOL_VERSIONS.includes(requested)
        ? requested
        : DEFAULT_PROTOCOL_VERSION;
      return rpcResult(id, {
        protocolVersion,
        capabilities: { tools: {}, prompts: {} },
        serverInfo: SERVER_INFO,
        instructions: SERVER_INSTRUCTIONS,
      });
    }

    // Removed in 2026-07-28, still sent by legacy clients as keepalive noise.
    case 'ping':
      return rpcResult(id, {}, modern);

    case 'tools/list':
      // TOOLS is a static array, so ordering is deterministic and the
      // catalogue is publicly cacheable — both spec asks for free.
      return rpcResult(
        id,
        {
          tools: TOOLS.map(({ name, title, description, inputSchema, annotations }) => ({
            name,
            title,
            description,
            inputSchema,
            annotations,
          })),
          ttlMs: LIST_TTL_MS,
          cacheScope: 'public',
        },
        modern
      );

    case 'tools/call': {
      const tool = TOOLS.find((t) => t.name === (params && params.name));
      if (!tool) {
        return rpcError(id, -32602, `Unknown tool: ${params && params.name}`);
      }
      try {
        const data = tool.run(catalogueFor(origin), (params && params.arguments) || {});
        return rpcResult(
          id,
          {
            content: [{ type: 'text', text: JSON.stringify(data) }],
          },
          modern
        );
      } catch (err) {
        return rpcResult(
          id,
          {
            content: [{ type: 'text', text: `Error running ${tool.name}: ${err}` }],
            isError: true,
          },
          modern
        );
      }
    }

    case 'prompts/list':
      return rpcResult(
        id,
        {
          prompts: PROMPTS.map(({ name, title, description, arguments: argspec }) => ({
            name,
            title,
            description,
            arguments: argspec,
          })),
          ttlMs: LIST_TTL_MS,
          cacheScope: 'public',
        },
        modern
      );

    case 'prompts/get': {
      const prompt = PROMPTS.find((p) => p.name === (params && params.name));
      if (!prompt) {
        return rpcError(id, -32602, `Unknown prompt: ${params && params.name}`);
      }
      return rpcResult(id, prompt.build((params && params.arguments) || {}), modern);
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

  const rejection = validateModernTransport(request, message);
  if (rejection) return jsonResponse(rejection.body, rejection.status);

  const origin = new URL(request.url).origin;
  const response = handleRpc(message, origin);
  logMcpCall(context, message, response);

  // Modern-era unknown methods map to HTTP 404 per the transport spec;
  // legacy responses stay 200 like they always were.
  const status =
    isModern(message) && response.error && response.error.code === -32601 ? 404 : 200;
  return jsonResponse(response, status);
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
// Client identity: legacy clients only identify themselves at `initialize`;
// MCP 2026-07-28+ clients carry clientInfo in _meta on every request, so
// tools/call rows from modern clients get client name and version too.
// `initialize`/`server/discover` rows give the client mix, `tools/call`
// rows give the tool mix and the actual query arguments.
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

    const meta = params._meta || {};
    const modernClientInfo = meta[META_CLIENT_INFO] || {};

    let toolName = '';
    let args = '';
    let clientName = String(modernClientInfo.name || '');
    let clientVersion = String(modernClientInfo.version || '');
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
      clientName = clientName || String(clientInfo.name || '');
      clientVersion = clientVersion || String(clientInfo.version || '');
    }

    const protocol =
      (typeof meta[META_VERSION] === 'string' ? meta[META_VERSION] : '') ||
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
