/**
 * MCP Server Card for cocktail.glass.
 *
 * Pre-connection discovery document for the remote MCP server at /mcp,
 * served at /.well-known/mcp/server-card.json.
 *
 * SEP-2127 (https://github.com/modelcontextprotocol/modelcontextprotocol/pull/2127)
 * is a draft and is internally inconsistent about the path — its prose says
 * /.well-known/mcp-server-card, its PR summary says /.well-known/mcp/server-card.json.
 * We serve the latter, the path discovery tooling actually probes. The
 * document is a superset: it carries both the SEP-2127 registry-style fields
 * (name, version, remotes) and the initialize-style fields (serverInfo,
 * endpoint, capabilities) so it satisfies either reading.
 */

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export function onRequestGet({ request }) {
  const origin = new URL(request.url).origin;
  const endpoint = `${origin}/mcp`;

  const card = {
    name: 'glass.cocktail/cocktail-glass',
    version: '1.0.0',
    title: 'Cocktail Glass',
    description:
      'Read-only MCP server for cocktail.glass. Search a catalogue of 500 ' +
      'cocktail recipes, fetch full recipes with ingredients and preparation ' +
      'steps, find drinks by ingredient, and get random suggestions.',
    websiteUrl: origin,
    serverInfo: {
      name: 'cocktail-glass',
      title: 'Cocktail Glass',
      version: '1.0.0',
    },
    endpoint,
    transport: 'streamable-http',
    capabilities: {
      tools: { listChanged: false },
    },
    icons: [
      {
        src: `${origin}/favicon.svg`,
        sizes: ['any'],
        mimeType: 'image/svg+xml',
      },
    ],
    remotes: [
      {
        type: 'streamable-http',
        url: endpoint,
        supportedProtocolVersions: ['2025-03-26', '2025-06-18', '2025-11-25'],
      },
    ],
  };

  return new Response(JSON.stringify(card, null, 2), {
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'public, max-age=3600',
      ...CORS_HEADERS,
    },
  });
}
