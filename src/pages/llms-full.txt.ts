import type { APIRoute } from 'astro';
import cocktails from '../../catalogue.mjs';
import originStories from '../../origin-stories.json';

type Ingredient = { name: string; amount?: string | number; unit?: string };
type Cocktail = {
  slug: string;
  name: string;
  family: string;
  glass: string;
  ingredients: Ingredient[];
  preparation: string[];
  garnish: string[];
};

function cocktailMarkdown(c: Cocktail, origin: string): string {
  const out: string[] = [
    `## ${c.name}`,
    '',
    `Source: ${origin}/${c.slug}/`,
    '',
    `${c.family} cocktail · Served in a ${c.glass}`,
    '',
    '### Ingredients',
    '',
  ];

  for (const i of c.ingredients) {
    if (i.amount) out.push(`- ${i.amount} ${i.unit ?? ''} ${i.name}`.replace(/\s+/g, ' ').trim());
    else out.push(`- ${i.name}`);
  }

  out.push('', '### Preparation', '');
  c.preparation.forEach((step, idx) => out.push(`${idx + 1}. ${step}`));

  if (c.garnish.length) out.push('', `**Garnish:** ${c.garnish.join(', ')}`);

  const story = (originStories as Record<string, { story?: string; sourceName?: string; sourceUrl?: string }>)[c.slug];
  if (story && story.story) {
    out.push('', '### Origin', '', story.story);
    if (story.sourceName && story.sourceUrl) {
      out.push('', `Source: [${story.sourceName}](${story.sourceUrl})`);
    }
  }

  return out.join('\n');
}

export const GET: APIRoute = ({ site }) => {
  const origin = site?.toString().replace(/\/$/, '') ?? 'https://cocktail.glass';

  const header = [
    '# Cocktail Glass — full content',
    '',
    '> Every cocktail in the catalogue, with ingredients, preparation steps, garnish, and origin notes where available.',
    '',
    `For programmatic access, cocktail.glass runs a Model Context Protocol (MCP) server at ${origin}/mcp — a stateless Streamable HTTP endpoint whose tools search cocktails, return full recipes, find drinks by ingredient, find drinks featured in a film or TV show, find drinks you can make from a set of ingredients, and suggest a random cocktail. The MCP server card is at ${origin}/.well-known/mcp/server-card.json, a machine-readable API catalogue at ${origin}/.well-known/api-catalog, and an Agent Skills index at ${origin}/.well-known/agent-skills/index.json. The full catalogue is also available as JSON from ${origin}/cocktails.json.`,
    '',
    '---',
    '',
  ];

  const body = (cocktails as Cocktail[]).map((c) => cocktailMarkdown(c, origin)).join('\n\n');

  return new Response(header.join('\n') + body + '\n', {
    headers: { 'Content-Type': 'text/markdown; charset=utf-8' },
  });
};
