#!/usr/bin/env node

/**
 * Cocktail Origin Story Generator for cocktail.glass
 *
 * Writes short origin blurbs to origin-stories.json, keyed by cocktail slug.
 *
 * Usage:
 *   node scripts/generate-origin-stories.mjs
 *   node scripts/generate-origin-stories.mjs --dry-run
 *   node scripts/generate-origin-stories.mjs --slug negroni
 *   node scripts/generate-origin-stories.mjs --force
 *   node scripts/generate-origin-stories.mjs --batch 25
 *   node scripts/generate-origin-stories.mjs --with-sources
 */

import fs from 'node:fs';
import path from 'node:path';

const ENV_PATH = path.resolve('.env');
loadEnvFile();

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
const MODEL = process.env.ORIGIN_MODEL || 'openai/gpt-4o-mini';
const OPENROUTER_API_URL = 'https://openrouter.ai/api/v1/chat/completions';
const COCKTAILS_PATH = path.resolve('cocktails.json');
const STORIES_PATH = path.resolve('origin-stories.json');
const REQUEST_DELAY_MS = 250;
const DEFAULT_CHUNK_SIZE = 10;

function loadEnvFile() {
  if (typeof process.loadEnvFile !== 'function') return;

  try {
    process.loadEnvFile(ENV_PATH);
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
  }
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function readJson(filePath, fallback) {
  if (!fs.existsSync(filePath)) return fallback;
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function writeJson(filePath, value) {
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function normalizeWhitespace(value) {
  return value.replace(/\s+/g, ' ').trim();
}

function normalizeName(value) {
  return value
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^\w\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function splitSentences(text) {
  return normalizeWhitespace(text)
    .split(/(?<=[.!?])\s+/)
    .map(sentence => sentence.trim())
    .filter(Boolean);
}

function pickOriginExcerpt(text) {
  const normalizedText = text.replace(/\r/g, '').trim();
  if (!normalizedText) return '';

  const blocks = normalizedText
    .split(/\n{2,}/)
    .map(block => block.trim())
    .filter(Boolean);

  for (let index = 0; index < blocks.length; index++) {
    const heading = blocks[index].toLowerCase();
    if (heading === 'history' || heading === 'origins' || heading === 'origin' || heading === 'etymology' || heading === 'background') {
      const excerpt = blocks.slice(index + 1, index + 3).join(' ');
      if (excerpt) return normalizeWhitespace(excerpt);
    }
  }

  const sentences = splitSentences(normalizedText);
  const originSentences = sentences.filter(sentence =>
    /(originat|created|invented|named after|popularized|first appeared|first documented|dates back|developed|introduced|credited to|claim|story|history)/i.test(sentence)
  );

  if (originSentences.length > 0) {
    return normalizeWhitespace(originSentences.slice(0, 3).join(' '));
  }

  return normalizeWhitespace(sentences.slice(0, 3).join(' '));
}

function hasCocktailSignals(summary) {
  const haystack = `${summary.title || ''}\n${summary.description || ''}\n${summary.extract || ''}`;
  return /(cocktail|mixed drink|drink|highball|tiki|apéritif|aperitif|sour|fizz|punch|digestif)/i.test(haystack);
}

function scoreArticle(summary, cocktailName) {
  const title = summary.title || '';
  const description = summary.description || '';
  const extract = summary.extract || '';
  const haystack = `${title}\n${description}\n${extract}`;
  const normalizedTitle = normalizeName(title);
  const normalizedCocktailName = normalizeName(cocktailName);

  let score = 0;

  if (normalizedTitle === normalizedCocktailName) score += 40;
  if (normalizedTitle.includes(normalizedCocktailName) || normalizedCocktailName.includes(normalizedTitle)) score += 15;
  if (hasCocktailSignals(summary)) score += 50;
  if (/\((cocktail|drink|mixed drink)\)/i.test(title)) score += 40;
  if (/(cocktail|drink)/i.test(description)) score += 20;
  if (/(album|song|film|band|rapper|magazine|antibiotic|novel|comic|company|software|programming language|tv series|television)/i.test(haystack)) score -= 100;

  return score;
}

async function fetchJson(url) {
  let attempts = 0;

  while (attempts < 4) {
    attempts += 1;

    const response = await fetch(url, {
      headers: {
        'User-Agent': 'cocktail.glass/0.0.1',
        'Accept': 'application/json',
      },
    });

    const text = await response.text();
    if (!response.ok || text.startsWith('You are making too many requests')) {
      await sleep(REQUEST_DELAY_MS * attempts * 4);
      continue;
    }

    return JSON.parse(text);
  }

  return null;
}

async function fetchSummary(title) {
  const url = `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`;
  const summary = await fetchJson(url);
  if (!summary?.extract) return null;
  return summary;
}

async function searchWikipedia(name) {
  const url = `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(`${name} cocktail`)}&format=json&origin=*`;
  const result = await fetchJson(url);
  return result?.query?.search?.map(entry => entry.title) || [];
}

async function fetchPlainExtract(title) {
  const url = `https://en.wikipedia.org/w/api.php?action=query&prop=extracts&titles=${encodeURIComponent(title)}&format=json&origin=*&explaintext=1&redirects=1`;
  const result = await fetchJson(url);
  const pages = Object.values(result?.query?.pages || {});
  const page = pages.find(candidate => candidate?.extract);
  return page?.extract || '';
}

async function findWikipediaContext(cocktail) {
  const titles = [
    cocktail.name,
    `${cocktail.name} (cocktail)`,
    `${cocktail.name} (drink)`,
    `${cocktail.name} cocktail`,
  ];

  const candidates = [];

  for (const title of titles) {
    const summary = await fetchSummary(title);
    if (!summary) continue;
    candidates.push(summary);
    await sleep(REQUEST_DELAY_MS);
  }

  if (candidates.length === 0) {
    const searchResults = await searchWikipedia(cocktail.name);
    await sleep(REQUEST_DELAY_MS);

    for (const title of searchResults.slice(0, 5)) {
      const summary = await fetchSummary(title);
      if (!summary) continue;
      candidates.push(summary);
      await sleep(REQUEST_DELAY_MS);
    }
  }

  const bestMatch = candidates
    .map(summary => ({ summary, score: scoreArticle(summary, cocktail.name) }))
    .sort((left, right) => right.score - left.score)[0];

  if (!bestMatch || bestMatch.score < 60) return null;

  const extract = await fetchPlainExtract(bestMatch.summary.title);
  await sleep(REQUEST_DELAY_MS);

  return {
    sourceName: 'Wikipedia',
    sourceUrl: bestMatch.summary.content_urls?.desktop?.page || `https://en.wikipedia.org/wiki/${encodeURIComponent(bestMatch.summary.title.replace(/ /g, '_'))}`,
    title: bestMatch.summary.title,
    extract: pickOriginExcerpt(extract || bestMatch.summary.extract || ''),
  };
}

function parseJsonResponse(text) {
  const normalized = text.trim();
  const withoutFence = normalized.replace(/^```json\s*|\s*```$/g, '');
  const start = withoutFence.indexOf('{');
  const end = withoutFence.lastIndexOf('}');
  const candidate = start >= 0 && end > start ? withoutFence.slice(start, end + 1) : withoutFence;
  const repaired = candidate
    .replace(/,\s*}/g, '}')
    .replace(/,\s*]/g, ']');

  return JSON.parse(repaired);
}

async function generateBatch(batch, sourceMap) {
  const payload = batch.map(cocktail => ({
    slug: cocktail.slug,
    name: cocktail.name,
    category: cocktail.category,
    glass: cocktail.glass,
    ingredients: cocktail.ingredients.map(ingredient => ingredient.name),
    sourceTitle: sourceMap[cocktail.slug]?.title || null,
    sourceUrl: sourceMap[cocktail.slug]?.sourceUrl || null,
    sourceExtract: sourceMap[cocktail.slug]?.extract || null,
  }));

  const response = await fetch(OPENROUTER_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
      'HTTP-Referer': 'https://cocktail.glass',
      'X-Title': 'cocktail.glass origin story generator',
    },
    body: JSON.stringify({
      model: MODEL,
      temperature: 0.4,
      messages: [
        {
          role: 'system',
          content: 'You write concise, trustworthy origin blurbs for a cocktail recipe site. Return valid JSON only. Each value must have a "story" string with 1-2 sentences. Focus on where, when, and how the drink emerged or became known. Do not describe ingredients, flavor, or serving style unless that detail is essential to the origin itself. Use provided source context when available. If source context is thin or absent, use broad common cocktail knowledge carefully and hedge uncertain claims instead of inventing specifics.',
        },
        {
          role: 'user',
          content: `Write an origin story for each cocktail in this JSON array. Return a JSON object keyed by slug. Each value must be an object with exactly one field: "story". Avoid markdown, lists, or code fences.\n\n${JSON.stringify(payload)}`,
        },
      ],
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`OpenRouter API error ${response.status}: ${errorText}`);
  }

  const data = await response.json();
  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new Error('No text content returned from OpenRouter.');

  return parseJsonResponse(content);
}

async function main() {
  const args = process.argv.slice(2);
  const targetSlug = args.includes('--slug') ? args[args.indexOf('--slug') + 1] : null;
  const force = args.includes('--force');
  const dryRun = args.includes('--dry-run');
  const withSources = args.includes('--with-sources');
  const batchSize = args.includes('--batch') ? parseInt(args[args.indexOf('--batch') + 1], 10) : null;
  const chunkSize = args.includes('--chunk-size') ? parseInt(args[args.indexOf('--chunk-size') + 1], 10) : DEFAULT_CHUNK_SIZE;
  const writeAtEnd = args.includes('--write-at-end');

  if (!dryRun && !OPENROUTER_API_KEY) {
    console.error('Error: OPENROUTER_API_KEY environment variable is required.');
    process.exit(1);
  }

  const cocktails = readJson(COCKTAILS_PATH, []);
  const existingStories = readJson(STORIES_PATH, {});

  let targets = cocktails.filter(cocktail => {
    if (targetSlug) return cocktail.slug === targetSlug;
    if (force) return true;
    return !existingStories[cocktail.slug]?.story;
  });

  if (targetSlug && targets.length === 0) {
    console.error(`Cocktail with slug "${targetSlug}" not found.`);
    process.exit(1);
  }

  if (batchSize && batchSize < targets.length) {
    targets = targets.slice(0, batchSize);
  }

  console.log(`Loaded ${cocktails.length} cocktails.`);
  console.log(`Origin stories to generate: ${targets.length}\n`);

  if (dryRun) {
    for (const cocktail of targets) {
      console.log(`  [DRY RUN] ${cocktail.slug}`);
    }
    return;
  }

  const sourceMap = {};
  if (withSources) {
    for (const [index, cocktail] of targets.entries()) {
      console.log(`[sources ${index + 1}/${targets.length}] ${cocktail.name}`);
      sourceMap[cocktail.slug] = await findWikipediaContext(cocktail);
    }
  }

  let generated = 0;
  const nextStories = { ...existingStories };

  for (let start = 0; start < targets.length; start += chunkSize) {
    const batch = targets.slice(start, start + chunkSize);
    console.log(`\n[batch ${Math.floor(start / chunkSize) + 1}] ${batch.length} cocktails`);

    const generatedBatch = await generateBatch(batch, sourceMap);

    for (const cocktail of batch) {
      const generatedStory = generatedBatch[cocktail.slug]?.story;
      if (!generatedStory) continue;

      nextStories[cocktail.slug] = {
        story: normalizeWhitespace(generatedStory),
        ...(sourceMap[cocktail.slug]?.sourceName ? { sourceName: sourceMap[cocktail.slug].sourceName } : {}),
        ...(sourceMap[cocktail.slug]?.sourceUrl ? { sourceUrl: sourceMap[cocktail.slug].sourceUrl } : {}),
      };

      generated += 1;
    }

    if (!writeAtEnd) {
      writeJson(STORIES_PATH, nextStories);
    }
  }

  writeJson(STORIES_PATH, nextStories);
  console.log(`\nSaved ${generated} origin stories to ${STORIES_PATH}`);
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
