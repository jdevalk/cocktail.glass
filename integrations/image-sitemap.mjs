import fs from 'node:fs';
import path from 'node:path';

export function imageSitemap() {
  return {
    name: 'image-sitemap',
    hooks: {
      'astro:build:done': async ({ dir, pages }) => {
        const siteUrl = 'https://cocktail.glass';
        const imagesDir = path.join(dir.pathname, '..', 'public', 'images');

        // Build a set of cocktail slugs that have images
        const imageFiles = new Set();
        try {
          for (const f of fs.readdirSync(path.resolve('public/images'))) {
            if (f.endsWith('.webp')) {
              imageFiles.add(f.replace('.webp', ''));
            }
          }
        } catch {}

        const urls = pages
          .map((p) => {
            const pagePath = p.pathname === '' ? '/' : `/${p.pathname}`;
            const loc = `${siteUrl}${pagePath}`;

            // Check if this is a cocktail detail page with an image
            const slug = p.pathname.replace(/\/$/, '');
            const images = [];
            if (slug && imageFiles.has(slug)) {
              images.push(`${siteUrl}/images/${slug}.webp`);
            }

            return { loc, images };
          })
          .sort((a, b) => a.loc.localeCompare(b.loc));

        const xml = [
          '<?xml version="1.0" encoding="UTF-8"?>',
          '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">',
          ...urls.map(({ loc, images }) => {
            const imageXml = images
              .map((img) => `    <image:image><image:loc>${img}</image:loc></image:image>`)
              .join('\n');
            return `  <url>\n    <loc>${loc}</loc>\n${imageXml ? imageXml + '\n' : ''}  </url>`;
          }),
          '</urlset>',
        ].join('\n');

        const outPath = new URL('sitemap.xml', dir);
        fs.writeFileSync(outPath, xml);

        // Remove old sitemap index files if they exist
        for (const old of ['sitemap-index.xml', 'sitemap-0.xml']) {
          const oldPath = new URL(old, dir);
          try { fs.unlinkSync(oldPath); } catch {}
        }

        console.log(`[image-sitemap] Generated sitemap.xml with ${urls.length} URLs (${urls.filter(u => u.images.length > 0).length} with images)`);
      },
    },
  };
}
