# cocktail.glass

## Stack
- Astro 6 static site, deployed to Cloudflare Pages
- No JS framework — vanilla inline scripts with `is:inline`. One exception: `src/components/WebMcp.astro` is a bundled module (no `is:inline`) because it `import`s the shared `cocktail-tools.mjs` tool module, and inline scripts cannot import.
- Pagefind for search (custom UI, not PagefindUI)
- `cocktail-tools.mjs` (repo root) holds the six MCP tool definitions and matching logic. Both the remote MCP server (`functions/mcp.js`) and the in-browser WebMCP integration import it — change a tool in one place.

## HTML principles
- Minimize attributes per element. Avoid adding classes when the element can be targeted by its position in the DOM (e.g., `.grid > a > h3` instead of `.card-name` on every card).
- Don't add `data-` attributes that duplicate information derivable from the DOM tree (e.g., don't put `data-category` on every card when the parent section already has it).
- Use `is:global` styles instead of Astro's scoped styles for pages with many repeated elements — scoped styles add a `data-astro-cid-*` attribute to every element, which adds significant weight at scale (saved ~155KB on the homepage with 500 cards).
- Scope bare element selectors (e.g., `header`, `h1`) to a parent class when using `is:global` to prevent them bleeding into the layout.

## CSS principles
- Prefer cascading selectors over class-per-element. Inside a known structure like `.grid > a`, target children by element type and position rather than adding classes.
- When converting from scoped to global styles, remove `:global()` wrappers — they create broken double-global selectors inside `<style is:global>`.
- Use `scroll-margin-top` on anchor targets to account for the sticky header.

## Performance
- Only the first 4 images in the homepage grid are eager-loaded (`loading="eager"`, `fetchpriority="high"`). The first image is also preloaded via `<link rel="preload">`.
- JSON-LD schema and search overlay JS are in the footer, after visible content.
- System font stack for body text (`--font-sans`), custom font only for display headings (Playfair Display). Only the latin subset is loaded.
- Homepage is ~526KB raw / ~54KB gzipped with 500 cocktail cards.
- Use `content-visibility: auto` on category sections for render performance.

## Search (Pagefind)
- Custom search UI (not PagefindUI) to enable title-match re-ranking.
- Exact title matches rank first, then "starts with", then "ends with", then "contains", then default pagefind relevance.
- `og:title` is used as the pagefind title (auto-detected). Description is set via `data-pagefind-meta` on the `data-pagefind-body` element.
- `diacriticSimilarity: 0.0` so "carre" matches "Carré".
- Homepage content is excluded from search via `data-pagefind-ignore`.

## Data conventions
- `cocktails.json` is the single source of truth for all cocktail data.
- `preparation` is an array of method-step strings (not a single string). Each step ends with a period — there is no "Garnish with …" step.
- `garnish` is a `string[]` on the cocktail (may be empty); garnishes are not ingredients.
- Each cocktail ingredient is `{ ref, amount, unit }`; `ref` points at an `id` in `ingredients.json`, the canonical ingredient table. See SCHEMA.md for the full model.
- `origin-stories.json` is keyed by slug.

## Dev workflow
- The user runs `astro dev` on localhost:4321. Use that for testing — don't start separate preview servers.
- Build with `npx astro build`. The custom image-sitemap integration generates `sitemap.xml` (not a sitemap index).

## Deployment
- Cloudflare Pages does **not** auto-deploy on GitHub push. Deployment is manual.
- Deploy with `npm run deploy:pages` (runs `astro build` then `wrangler pages deploy dist`).
- The GitHub Actions workflows only run data validation and link checking — neither deploys.
