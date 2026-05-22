/**
 * One-off data migration — Tier 1 of the agent-native data refactor.
 *
 * - Garnish becomes a string array on the record, sourced from the (most
 *   complete) top-level `garnish` field. "None" collapses to [].
 * - Garnish pseudo-ingredients (`unit: "garnish"`) are dropped from
 *   `ingredients` — garnish is no longer overloaded into the ingredient list.
 * - The derived "Garnish with ..." preparation step is dropped; renderers
 *   now compose it from the `garnish` array.
 * - `ingredient.amount` becomes a number instead of a numeric string.
 *
 * Idempotent: re-running on already-migrated data is a no-op.
 */
import { readFileSync, writeFileSync } from 'node:fs';

const file = new URL('../cocktails.json', import.meta.url);
const cocktails = JSON.parse(readFileSync(file, 'utf8'));

function toGarnishArray(value) {
  if (Array.isArray(value)) return value; // already migrated
  const raw = String(value || '').trim();
  if (!raw || /^none$/i.test(raw)) return [];
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

let droppedIngredients = 0;
let droppedSteps = 0;

for (const c of cocktails) {
  c.garnish = toGarnishArray(c.garnish);

  const kept = c.ingredients.filter((i) => i.unit !== 'garnish');
  droppedIngredients += c.ingredients.length - kept.length;
  c.ingredients = kept.map((i) => ({
    name: i.name,
    amount: i.amount === '' || i.amount == null ? null : Number(i.amount),
    unit: i.unit,
  }));

  const steps = c.preparation.filter((s) => !/^garnish\b/i.test(String(s).trim()));
  droppedSteps += c.preparation.length - steps.length;
  c.preparation = steps;
}

writeFileSync(file, JSON.stringify(cocktails, null, 2) + '\n');
console.log(
  `Migrated ${cocktails.length} cocktails — dropped ${droppedIngredients} garnish ingredients, ${droppedSteps} garnish steps.`
);
