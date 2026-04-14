import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

function gitLastmod(filePath) {
  try {
    const out = execFileSync('git', ['log', '-1', '--format=%cI', '--', filePath], {
      encoding: 'utf-8',
    }).trim();
    return out || null;
  } catch {
    return null;
  }
}

// Map a built page pathname to the source file that produced it. Used to
// derive an accurate <lastmod> from git commit history rather than the
// CI checkout timestamp (which would mark every URL as "modified today"
// on every deploy).
function resolveSourceFile(pathname) {
  const slug = pathname.replace(/\/$/, '');
  if (!slug) return path.resolve('src/pages/index.astro');
  const direct = path.resolve('src/pages', `${slug}.astro`);
  if (fs.existsSync(direct)) return direct;
  // Cocktail detail pages are produced by [slug].astro from cocktails.json.
  // Use cocktails.json's mtime as a proxy — it captures content updates,
  // which is the right signal for a recipe page.
  const dataFile = path.resolve('cocktails.json');
  if (fs.existsSync(dataFile)) return dataFile;
  return null;
}

export function imageSitemap() {
  return {
    name: 'image-sitemap',
    hooks: {
      'astro:build:done': async ({ dir, pages }) => {
        const siteUrl = 'https://cocktail.glass';

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
          .filter((p) => !/^404\/?$/.test(p.pathname))
          .map((p) => {
            const pagePath = p.pathname === '' ? '/' : `/${p.pathname}`;
            const loc = `${siteUrl}${pagePath}`;

            const slug = p.pathname.replace(/\/$/, '');
            const images = [];
            if (slug && imageFiles.has(slug)) {
              images.push(`${siteUrl}/images/${slug}.webp`);
            }

            const sourceFile = resolveSourceFile(p.pathname);
            const lastmod = sourceFile ? gitLastmod(sourceFile) : null;

            return { loc, images, lastmod };
          })
          .sort((a, b) => a.loc.localeCompare(b.loc));

        const xml = [
          '<?xml version="1.0" encoding="UTF-8"?>',
          '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">',
          ...urls.map(({ loc, images, lastmod }) => {
            const imageXml = images
              .map((img) => `    <image:image><image:loc>${img}</image:loc></image:image>`)
              .join('\n');
            const lastmodXml = lastmod ? `    <lastmod>${lastmod}</lastmod>\n` : '';
            return `  <url>\n    <loc>${loc}</loc>\n${lastmodXml}${imageXml ? imageXml + '\n' : ''}  </url>`;
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
