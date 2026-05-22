/**
 * Data integrity check for cocktail.glass — runs in CI on every change to the
 * data files (see .github/workflows/data-validation.yml).
 *
 * Validates cocktails.json and ingredients.json against the shape documented
 * in SCHEMA.md, and — the point of the exercise — checks that every cocktail
 * ingredient `ref` resolves to a real ingredient id. Exits non-zero on any
 * violation, so broken data can't be merged.
 */
import { readFileSync } from 'node:fs';

const root = new URL('../', import.meta.url);
const read = (p) => JSON.parse(readFileSync(new URL(p, root), 'utf8'));

const FAMILY = new Set([
  'Spirit-Forward', 'Sour', 'Fizz & Collins', 'Highball', 'Spritz',
  'Champagne Cocktail', 'Tiki', 'Punch', 'Flip & Nog', 'Hot Drink', 'Shot', 'Other',
]);
const METHOD = new Set(['Shaken', 'Stirred', 'Built', 'Blended']);
const TAGS = new Set(['classic', 'modern-classic', 'low-abv', 'non-alcoholic', 'frozen']);
const UNITS = new Set([
  'ml', 'dash', 'barspoon', 'pinch', 'drop', 'piece', 'slice', 'leaves',
  'wedge', 'whole', 'puff',
]);
const TYPES = new Set([
  'spirit', 'liqueur', 'fortified-wine', 'wine', 'beer-cider', 'juice',
  'syrup', 'bitters', 'mixer', 'dairy-egg', 'produce', 'other',
]);

const errors = [];
const E = (m) => errors.push(m);

// --- ingredients.json -----------------------------------------------------
const ingredients = read('ingredients.json');
const ids = new Set();
if (!Array.isArray(ingredients)) E('ingredients.json: not an array');
else
  ingredients.forEach((ing, n) => {
    const at = `ingredients[${n}]`;
    if (typeof ing.id !== 'string' || !ing.id) E(`${at}: missing id`);
    else {
      if (ids.has(ing.id)) E(`${at}: duplicate id "${ing.id}"`);
      ids.add(ing.id);
    }
    if (typeof ing.name !== 'string' || !ing.name) E(`${at} (${ing.id}): missing name`);
    if (!TYPES.has(ing.type)) E(`${at} (${ing.id}): bad type "${ing.type}"`);
    if (!Array.isArray(ing.aliases) || ing.aliases.some((a) => typeof a !== 'string'))
      E(`${at} (${ing.id}): aliases must be a string array`);
  });

// --- cocktails.json -------------------------------------------------------
const cocktails = read('cocktails.json');
const slugs = new Set();
if (!Array.isArray(cocktails)) E('cocktails.json: not an array');
else
  cocktails.forEach((c, n) => {
    const at = c && c.slug ? `"${c.slug}"` : `cocktails[${n}]`;
    if (typeof c.name !== 'string' || !c.name) E(`${at}: missing name`);
    if (typeof c.slug !== 'string' || !c.slug) E(`${at}: missing slug`);
    else {
      if (slugs.has(c.slug)) E(`${at}: duplicate slug`);
      slugs.add(c.slug);
    }
    if (typeof c.glass !== 'string' || !c.glass) E(`${at}: missing glass`);
    if (!FAMILY.has(c.family)) E(`${at}: bad family "${c.family}"`);
    if (!METHOD.has(c.method)) E(`${at}: bad method "${c.method}"`);
    if (!Array.isArray(c.tags) || c.tags.some((t) => !TAGS.has(t)))
      E(`${at}: bad tags ${JSON.stringify(c.tags)}`);
    if (!Array.isArray(c.garnish) || c.garnish.some((g) => typeof g !== 'string'))
      E(`${at}: garnish must be a string array`);
    if (
      !Array.isArray(c.preparation) ||
      c.preparation.length === 0 ||
      c.preparation.some((s) => typeof s !== 'string')
    )
      E(`${at}: preparation must be a non-empty string array`);
    if (!Array.isArray(c.ingredients) || c.ingredients.length === 0)
      E(`${at}: ingredients must be a non-empty array`);
    else
      c.ingredients.forEach((i, k) => {
        if (typeof i.ref !== 'string' || !ids.has(i.ref))
          E(`${at}: ingredient[${k}] unresolved ref "${i.ref}"`);
        if (typeof i.amount !== 'number' || !Number.isFinite(i.amount))
          E(`${at}: ingredient[${k}] (${i.ref}) amount must be a number`);
        if (!UNITS.has(i.unit))
          E(`${at}: ingredient[${k}] (${i.ref}) bad unit "${i.unit}"`);
      });
  });

if (errors.length) {
  console.error(`Data validation FAILED — ${errors.length} error(s):`);
  for (const e of errors.slice(0, 100)) console.error('  ' + e);
  if (errors.length > 100) console.error(`  …and ${errors.length - 100} more`);
  process.exit(1);
}

console.log(
  `Data OK — ${cocktails.length} cocktails, ${ingredients.length} ingredients, every ref resolves.`
);
