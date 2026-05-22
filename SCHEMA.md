# Data schema — `agent-native-data-refactor`

The data model for cocktail.glass, after the agent-native refactor. This file
is the contract every migration step and reader update works from.

The refactor lands in three tiers:

- **Tier 1** — garnish becomes an array stored once; `amount` becomes a number;
  garnish pseudo-ingredients and derived garnish prep steps are gone. _(done)_
- **Tier 2** — the overloaded `category` field is split into orthogonal
  `family`, `method`, and `tags`.
- **Tier 3** — ingredients are normalised into `ingredients.json`; each cocktail
  ingredient references a canonical ingredient by `ref`.

`glass` stays free-text for now — out of scope for this refactor.

## `cocktails.json` — final record shape

```json
{
  "name": "Negroni",
  "slug": "negroni",
  "glass": "Tumbler",
  "family": "Spirit-Forward",
  "method": "Stirred",
  "tags": ["classic"],
  "ingredients": [
    { "ref": "gin", "amount": 30, "unit": "ml" },
    { "ref": "campari", "amount": 30, "unit": "ml" },
    { "ref": "sweet-vermouth", "amount": 30, "unit": "ml" }
  ],
  "garnish": ["Orange peel"],
  "preparation": [
    "Stir all ingredients with ice.",
    "Strain into a rocks glass over a large ice cube."
  ]
}
```

- `category` is **removed** — replaced by `family` + `method` + `tags`.
- Each `ingredients[]` entry is `{ ref, amount, unit }`. `ref` is an ingredient
  `id` from `ingredients.json`; the display name is resolved from there. No
  `name` on the cocktail ingredient — single source of truth.
- `amount` is a required `number`. `unit` is one of:
  `ml`, `dash`, `barspoon`, `pinch`, `drop`, `piece`, `slice`, `leaves`,
  `wedge`, `whole`, `puff`.
- `garnish` is a `string[]` (may be empty).
- `preparation` is method steps only — no "Garnish with …" step.

### `family` — the drink family (exactly one)

A single structural family. **Joost: redline this value set and the edge calls.**

| value | definition |
| --- | --- |
| `Spirit-Forward` | Spirit-dominant, no citrus, usually stirred; modified by sugar, bitters, or fortified wine. Old Fashioned, Manhattan, Negroni, Martini, Sazerac, Vieux Carré. |
| `Sour` | Base spirit + citrus + sweetener, no carbonation. Daiquiri, Margarita, Whiskey Sour, Sidecar, Gimlet, Last Word, Cosmopolitan. |
| `Fizz & Collins` | A sour lengthened with soda water. Tom Collins, Gin Fizz, Ramos Gin Fizz, Mojito. |
| `Highball` | Spirit + a larger pour of non-citrus mixer, served long over ice. Gin & Tonic, Cuba Libre, Dark 'n' Stormy, Moscow Mule, Screwdriver. |
| `Spritz` | Low-ABV aperitivo/wine base + sparkling wine and/or soda, served long. Aperol Spritz, Hugo, Americano. |
| `Champagne Cocktail` | Built on sparkling wine. French 75, Mimosa, Bellini, Kir Royale, Champagne Cocktail. |
| `Tiki` | Rum-forward (often multiple rums), tropical, citrus + exotic syrups/spices. Mai Tai, Zombie, Jungle Bird, Painkiller. |
| `Punch` | Batched / large-format / tea-and-fruit style. Fish House Punch, Planter's Punch. |
| `Flip & Nog` | Egg- and/or dairy-rich. Eggnog, Brandy Alexander, Grasshopper, White Russian. |
| `Hot Drink` | Served hot. Irish Coffee, Hot Toddy, Hot Buttered Rum, Mulled Wine. |
| `Shot` | Small, served in one go. B-52, Kamikaze, Lemon Drop Shot, Jägerbomb. |
| `Other` | Use sparingly; anything that genuinely fits nothing above. |

Known edge calls to flag for review: Americano (Spritz vs Highball), White
Russian (Flip & Nog vs Highball), Mojito (Fizz & Collins vs Highball).

### `method` — preparation technique (exactly one)

`Shaken` · `Stirred` · `Built` · `Blended`

Derive from the `preparation` steps: a "Shake…" step → `Shaken` (a dry shake
counts), "Stir…" → `Stirred`, "Blend…"/"Freeze…" → `Blended`, "Build…" /
"Pour…" / "Layer…" / "Combine…" with no shake or stir → `Built`. A "Muddle…"
or "Rim…" step is not decisive — read on to the real technique.

### `tags` — orthogonal flags (zero or more)

`classic` · `modern-classic` · `low-abv` · `non-alcoholic` · `frozen`

`classic` / `modern-classic` is era (from the old `category` values of the
same name). `low-abv` and `non-alcoholic` come from old `Low alcohol` /
`No alcohol`. `frozen` is for blended-and-served-frozen drinks (old `Frozen`).

## `ingredients.json` — canonical ingredient table (new file)

```json
[
  { "id": "gin", "name": "Gin", "type": "spirit", "aliases": ["London dry gin"] },
  { "id": "campari", "name": "Campari", "type": "liqueur", "aliases": [] },
  { "id": "sweet-vermouth", "name": "Sweet vermouth", "type": "fortified-wine",
    "aliases": ["red vermouth", "rosso vermouth"] }
]
```

- `id` — kebab-case of the canonical name, unique. Stable; cocktails reference it.
- `name` — display name.
- `type` — one of: `spirit`, `liqueur`, `fortified-wine`, `wine`, `beer-cider`,
  `juice`, `syrup`, `bitters`, `mixer`, `dairy-egg`, `produce`, `other`.
- `aliases` — other names a person might use for the same bottle, used to match
  user-supplied ingredients in `find_makeable_cocktails` (e.g. brand names, or
  a generic term like `lime` for `lime-juice`). Lowercase.

Garnishes are **not** ingredients — they stay as free strings in `garnish`.

## Shared resolver

A small module (`catalogue.mjs` at repo root) imports `cocktails.json` +
`ingredients.json` and exports a denormalised view — every cocktail ingredient
joined to its `{ name, type }`. Astro pages, Pages Functions, and the WebMCP
component all import the resolver instead of the raw JSON, so the join logic
lives in one place. The public `/cocktails.json` feed emits the denormalised
shape (names inlined) for external consumers.

## Validation

`schema/*.schema.json` (JSON Schema) plus a CI step that validates both data
files and checks every cocktail `ingredient.ref` resolves to an `ingredients.json`
`id`. That referential check is the integrity guarantee — enforced at commit
time.
