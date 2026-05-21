import cocktails from '../cocktails.json';

/**
 * Health check for cocktail.glass, served at /health.
 *
 * Referenced as the `status` link for each API in the RFC 9727 API catalog
 * (functions/.well-known/api-catalog.js). It is a real check: it confirms the
 * cocktail dataset that backs both the MCP server and the JSON feed is loaded
 * and non-empty, and reports 503 if it is not.
 */

export function onRequestGet() {
  const ok = Array.isArray(cocktails) && cocktails.length > 0;

  const body = {
    status: ok ? 'pass' : 'fail',
    description: 'cocktail.glass MCP server and cocktail data feed',
    cocktailCount: ok ? cocktails.length : 0,
    time: new Date().toISOString(),
  };

  return new Response(JSON.stringify(body, null, 2), {
    status: ok ? 200 : 503,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
      'Access-Control-Allow-Origin': '*',
    },
  });
}
