import cocktails from '../cocktails.json';
import originStories from '../origin-stories.json';

/**
 * Markdown content negotiation.
 *
 * Same-URL negotiation: when a request carries `Accept: text/markdown`, page
 * routes return a clean Markdown rendering instead of HTML — far cheaper for
 * agents and LLMs to consume. Browsers never send that Accept value, so
 * ordinary traffic falls straight through to next() untouched.
 *
 * Static assets (CSS/JS/images/fonts/pagefind) are kept off this Worker
 * entirely by public/_routes.json, so only HTML pages and API routes run it.
 */

const bySlug = new Map(cocktails.map((c) => [c.slug, c]));

export async function onRequest(context) {
  const { request, next } = context;

  if (request.method !== 'GET') return next();

  const accept = (request.headers.get('Accept') || '').toLowerCase();
  if (!accept.includes('text/markdown')) return next();

  const url = new URL(request.url);
  const markdown = renderMarkdown(url.pathname, url.origin);
  if (markdown === null) return next();

  return new Response(markdown, {
    headers: {
      'Content-Type': 'text/markdown; charset=utf-8',
      Vary: 'Accept',
      'Cache-Control': 'public, max-age=3600',
      'X-Markdown-Tokens': String(Math.ceil(markdown.length / 4)),
    },
  });
}

function renderMarkdown(pathname, origin) {
  const path = pathname.replace(/\/+$/, '') || '/';
  if (path === '/') return homepageMarkdown(origin);
  const cocktail = bySlug.get(path.slice(1));
  return cocktail ? cocktailMarkdown(cocktail, origin) : null;
}

function cocktailMarkdown(c, origin) {
  const out = [`# ${c.name}`, '', `${c.category} cocktail · Served in a ${c.glass}`, '', '## Ingredients', ''];

  for (const i of c.ingredients) {
    if (i.unit === 'garnish') out.push(`- ${i.name} — garnish`);
    else if (i.amount) out.push(`- ${i.amount} ${i.unit} ${i.name}`);
    else out.push(`- ${i.name}`);
  }

  out.push('', '## Preparation', '');
  c.preparation.forEach((step, idx) => out.push(`${idx + 1}. ${step}`));

  if (c.garnish) out.push('', `**Garnish:** ${c.garnish}`);

  const origin_story = originStories[c.slug];
  if (origin_story && origin_story.story) {
    out.push('', '## Origin', '', origin_story.story);
    if (origin_story.sourceName && origin_story.sourceUrl) {
      out.push('', `Source: [${origin_story.sourceName}](${origin_story.sourceUrl})`);
    }
  }

  out.push('', '---', '', `[View on cocktail.glass](${origin}/${c.slug}/)`, '');
  return out.join('\n');
}

function homepageMarkdown(origin) {
  const out = [
    '# Cocktail Glass',
    '',
    'Discover 500 cocktail recipes with ingredients, glassware, and preparation methods.',
    '',
    `- MCP server: ${origin}/mcp`,
    `- API catalog: ${origin}/.well-known/api-catalog`,
    `- JSON data feed: ${origin}/cocktails.json`,
    '',
    '## Cocktails by category',
    '',
  ];

  const categories = new Map();
  for (const c of cocktails) {
    if (!categories.has(c.category)) categories.set(c.category, []);
    categories.get(c.category).push(c);
  }

  for (const [category, list] of categories) {
    out.push(`### ${category}`, '');
    for (const c of list) out.push(`- [${c.name}](${origin}/${c.slug}/)`);
    out.push('');
  }

  return out.join('\n');
}
