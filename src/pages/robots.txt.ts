import type { APIRoute } from 'astro';

export const GET: APIRoute = ({ site }) => {
  const siteUrl = site?.toString().replace(/\/$/, '') ?? 'https://cocktail.glass';

  const body = `User-agent: *
Allow: /

Sitemap: ${siteUrl}/sitemap.xml
Schemamap: ${siteUrl}/schemamap.xml
`;

  return new Response(body, {
    headers: { 'Content-Type': 'text/plain' },
  });
};
