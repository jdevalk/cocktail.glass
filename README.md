# cocktail.glass

<p align="center">
  <a href="https://cocktail.glass"><img src="https://cocktail.glass/og/home.jpg" alt="cocktail.glass" width="640"></a>
</p>

<p align="center">
  <strong>500 cocktail recipes, built to be read by people and AI agents alike.</strong>
</p>

<p align="center">
  <a href="https://cocktail.glass">cocktail.glass</a> ·
  <a href="https://github.com/jdevalk/cocktail.glass/actions/workflows/link-check.yml"><img src="https://github.com/jdevalk/cocktail.glass/actions/workflows/link-check.yml/badge.svg" alt="Link Check"></a>
</p>

[cocktail.glass](https://cocktail.glass) is a catalogue of 500 cocktail recipes — each one with its ingredients, measures, glassware, garnish, and step-by-step method. It is a fast static site for people, and a fully machine-readable data source for AI agents.

## For people

- 500 recipes, browsable by category, glass, and ingredient
- Instant client-side search
- Origin stories for the classics
- A homepage that ships 500 cards in roughly 54&nbsp;KB gzipped

## For AI agents

cocktail.glass doubles as a working reference implementation of an agent-ready website. Everything here is live and free, with no API key:

- **MCP server** at [`/mcp`](https://cocktail.glass/mcp) — a remote, stateless Streamable HTTP endpoint with six read-only tools and a guided prompt
- **WebMCP** — the same tools in-page through `navigator.modelContext`
- **Markdown content negotiation** — request any page with `Accept: text/markdown` and get clean Markdown instead of HTML
- **[`/cocktails.json`](https://cocktail.glass/cocktails.json)** — the whole catalogue in one file
- **[`/llms.txt`](https://cocktail.glass/llms.txt)**, an MCP server card, and an RFC&nbsp;9727 API catalog for discovery

Full guide: [cocktail.glass/for-agents](https://cocktail.glass/for-agents/).

## Tech stack

- [Astro](https://astro.build) static site — no UI framework, just vanilla inline scripts
- [Pagefind](https://pagefind.app) for search
- [Cloudflare Pages](https://pages.cloudflare.com) hosting, with Pages Functions for `/mcp`, the API endpoints, and Markdown negotiation
- `cocktails.json` is the single source of truth for every recipe

## Development

```bash
npm install
npm run dev      # astro dev on http://localhost:4321
npm run build    # static output written to dist/
```

Deploy to Cloudflare Pages:

```bash
npm run deploy:pages
```

## Project layout

| Path | Contents |
| --- | --- |
| `cocktails.json` | All 500 recipes — the single source of truth |
| `src/pages/` | Astro pages and routes |
| `functions/` | Cloudflare Pages Functions — `/mcp`, API endpoints, middleware |
| `scripts/` | Build-time generators for images, OG cards, and origin stories |

## Security

Found a security issue? See [SECURITY.md](SECURITY.md) — please do not open a public issue.

## License

The **source code** in this repository is licensed under the [MIT License](LICENSE). Take it apart, learn from it, reuse the patterns.

The **cocktail recipe data and written content** — `cocktails.json`, `ingredients.json`, `movie-appearances.json`, `origin-stories.json`, and the page copy — are © 2026 Joost de Valk, all rights reserved. They are published here for transparency, but may not be copied or republished. To reuse the data, [get in touch](mailto:joost@joost.blog).
