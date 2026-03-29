import type { Cocktail } from '../types';

let cachedNames: { name: string; slug: string }[] | null = null;

function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function escapeRegex(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Single-word names distinctive enough to auto-link
const ALLOW_SINGLE = new Set([
  'negroni', 'margarita', 'daiquiri', 'martini', 'manhattan', 'mojito',
  'paloma', 'gimlet', 'cosmopolitan', 'boulevardier', 'caipirinha',
  'americano', 'bellini', 'sidecar', 'sazerac',
]);

export function linkifyCocktails(text: string, cocktails: Cocktail[], currentSlug: string): string {
  if (!cachedNames) {
    cachedNames = cocktails
      .filter((c) => {
        const words = c.name.split(/\s+/);
        if (words.length >= 2) return true;
        return ALLOW_SINGLE.has(c.name.toLowerCase());
      })
      .sort((a, b) => b.name.length - a.name.length)
      .map((c) => ({ name: c.name, slug: c.slug }));
  }

  let result = escapeHtml(text);
  const linked = new Set<string>();

  // Build a set of all linkable name strings (lowercased) for substring checks
  const allNames = cachedNames.map((n) => n.name.toLowerCase());

  for (const { name, slug } of cachedNames) {
    if (slug === currentSlug) continue;
    if (linked.has(slug)) continue;

    const pattern = new RegExp(`(?<![\\w-])(?<!early |late |mid-|mid )${escapeRegex(name)}(?![\\w-])`, 'gi');
    let match: RegExpExecArray | null;

    while ((match = pattern.exec(result)) !== null) {
      const before = result.slice(0, match.index);
      const after = result.slice(match.index + match[0].length);

      // Skip if inside an HTML tag or inside an existing <a> element
      if (before.lastIndexOf('<') > before.lastIndexOf('>')) continue;
      const lastOpenA = before.lastIndexOf('<a ');
      const lastCloseA = before.lastIndexOf('</a>');
      if (lastOpenA > lastCloseA) continue;

      // Skip if this match is part of a longer cocktail name in the text
      const contextStart = Math.max(0, match.index - 30);
      const contextEnd = Math.min(result.length, match.index + match[0].length + 30);
      const context = result.slice(contextStart, contextEnd).toLowerCase();
      const matchLower = match[0].toLowerCase();
      const isPartOfLonger = allNames.some(
        (n) => n.length > matchLower.length && n.includes(matchLower) && context.includes(n)
      );
      if (isPartOfLonger) continue;

      result = `${before}<a href="/${slug}/" class="origin-link">${match[0]}</a>${after}`;
      linked.add(slug);
      break;
    }
  }

  return result;
}
