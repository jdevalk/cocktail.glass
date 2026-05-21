/**
 * WebMCP usage beacon.
 *
 * Receives a small POST from the in-browser WebMCP integration
 * (src/components/WebMcp.astro) each time an in-page agent calls one of the
 * cocktail tools, and records it in the MCP_LOG Analytics Engine dataset with
 * surface = 'webmcp'. The /admin/stats dashboard reads these alongside remote
 * /mcp server calls (surface = 'remote').
 *
 * The four tool names live in three files — functions/mcp.js,
 * src/components/WebMcp.astro, and this endpoint — keep them in sync.
 */

const KNOWN_TOOLS = new Set([
  'search_cocktails',
  'get_cocktail_recipe',
  'find_cocktails_by_ingredient',
  'find_makeable_cocktails',
  'random_cocktail',
]);

// Only POST is handled; Pages returns 405 for other methods automatically.
export async function onRequestPost(context) {
  const { request, env } = context;

  // navigator.sendBeacon posts the body as text/plain — parse it as JSON.
  let payload;
  try {
    payload = JSON.parse(await request.text());
  } catch {
    return new Response(null, { status: 204 });
  }

  // Ignore anything that isn't a call to a known tool — keeps the dataset
  // clean if the endpoint is hit by something other than our own page.
  const tool = String((payload && payload.tool) || '');
  if (!KNOWN_TOOLS.has(tool)) return new Response(null, { status: 204 });

  const dataset = env.MCP_LOG;
  if (dataset) {
    try {
      let args = '';
      try {
        args = JSON.stringify((payload && payload.args) || {}).slice(0, 500);
      } catch {
        args = '';
      }
      dataset.writeDataPoint({
        blobs: [
          'tools/call', // blob1 method
          tool, // blob2 tool
          args, // blob3 args
          '', // blob4 clientName — not available in the browser
          '', // blob5 clientVersion
          '', // blob6 protocol — n/a (WebMCP browser API, not MCP-over-HTTP)
          (request.headers.get('user-agent') || '').slice(0, 300), // blob7
          request.cf?.country || '', // blob8
          '', // blob9 isError — beacon fires before execute, so unknown
          'webmcp', // blob10 surface
        ],
        indexes: [tool],
      });
    } catch {
      // Never fail the beacon because logging failed.
    }
  }

  return new Response(null, { status: 204 });
}
