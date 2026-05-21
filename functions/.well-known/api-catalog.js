/**
 * API catalog for cocktail.glass — RFC 9727 / RFC 9264 / RFC 8288.
 *
 * A machine-readable index of this site's agent- and machine-facing APIs,
 * served at /.well-known/api-catalog in the Linkset JSON format (RFC 9264)
 * so MCP clients, registries, and agents can discover them without scraping
 * HTML. Each linkset member anchors an API endpoint and links its
 * description, documentation, and health check (RFC 9727 Appendix A shape).
 *
 * Advertised to agents via a `Link: rel="api-catalog"` response header on
 * every page — see public/_headers.
 *
 * Note: the MCP server has no OpenAPI document because it is not a REST API;
 * its `service-desc` is the MCP server card (SEP-2127), the MCP-native
 * machine-readable service description.
 */

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export function onRequestGet({ request }) {
  const origin = new URL(request.url).origin;

  const serviceDoc = {
    href: `${origin}/llms.txt`,
    type: 'text/markdown',
    title: 'Site overview for language models',
  };
  const status = {
    href: `${origin}/health`,
    type: 'application/json',
    title: 'Health check',
  };

  const linkset = {
    linkset: [
      {
        anchor: `${origin}/mcp`,
        'service-desc': [
          {
            href: `${origin}/.well-known/mcp/server-card.json`,
            type: 'application/json',
            title: 'MCP server card (SEP-2127)',
          },
        ],
        'service-doc': [serviceDoc],
        status: [status],
      },
      {
        anchor: `${origin}/cocktails.json`,
        'service-desc': [
          {
            href: `${origin}/schema/cocktails.json`,
            type: 'application/json',
            title: 'Schema.org structured-data graph of all cocktails',
          },
        ],
        'service-doc': [serviceDoc],
        status: [status],
      },
    ],
  };

  return new Response(JSON.stringify(linkset, null, 2), {
    headers: {
      'Content-Type':
        'application/linkset+json; profile="https://www.rfc-editor.org/info/rfc9727"',
      'Cache-Control': 'public, max-age=3600',
      ...CORS_HEADERS,
    },
  });
}
