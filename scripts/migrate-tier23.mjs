/**
 * One-off data migration — Tiers 2 & 3 of the agent-native data refactor.
 *
 * Tier 2: replaces the overloaded `category` field with `family` + `method` +
 *         `tags`, sourced from scripts/classification.json.
 * Tier 3: converts each ingredient `{ name, amount, unit }` to
 *         `{ ref, amount, unit }`, where `ref` is the canonical ingredient id
 *         from ingredients.json.
 *
 * Aborts WITHOUT writing if any cocktail is unclassified or any ingredient
 * name fails to resolve to an ingredient id — so a partial/broken file is
 * never produced.
 *
 * Prerequisites: ingredients.json and scripts/classification.json must exist.
 */
import { readFileSync, writeFileSync } from 'node:fs';

const root = new URL('../', import.meta.url);
const read = (p) => JSON.parse(readFileSync(new URL(p, root), 'utf8'));

// Must match scripts/build of ingredients.json exactly — ids are derived from
// ingredient names with this function on both sides.
function toId(name) {
  return String(name)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

const cocktails = read('cocktails.json');
const ingredients = read('ingredients.json');
const classification = read('scripts/classification.json');

const ingredientIds = new Set(ingredients.map((i) => i.id));
const errors = [];

const migrated = cocktails.map((c) => {
  const cls = classification[c.slug];
  if (!cls) errors.push(`No classification entry for "${c.slug}"`);

  const ings = c.ingredients.map((i) => {
    const ref = toId(i.name);
    if (!ingredientIds.has(ref)) {
      errors.push(`"${c.slug}": ingredient "${i.name}" → unknown ref "${ref}"`);
    }
    return { ref, amount: i.amount, unit: i.unit };
  });

  return {
    name: c.name,
    slug: c.slug,
    glass: c.glass,
    family: cls?.family,
    method: cls?.method,
    tags: cls?.tags ?? [],
    ingredients: ings,
    garnish: c.garnish,
    preparation: c.preparation,
  };
});

if (errors.length) {
  console.error(`Migration aborted — ${errors.length} problem(s), nothing written:`);
  for (const e of errors.slice(0, 50)) console.error('  ' + e);
  if (errors.length > 50) console.error(`  …and ${errors.length - 50} more`);
  process.exit(1);
}

writeFileSync(new URL('cocktails.json', root), JSON.stringify(migrated, null, 2) + '\n');
console.log(`Migrated ${migrated.length} cocktails — category → family/method/tags, ingredient names → refs.`);
