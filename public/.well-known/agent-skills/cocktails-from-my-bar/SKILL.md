---
name: cocktails-from-my-bar
description: Turn a photo of a home bar, or a list of bottles, into the cocktails you can make right now using cocktail.glass.
---

# Cocktails from my bar

Given a photo of someone's liquor cabinet — or a typed list of what they own —
work out which cocktails they can make right now, and which they are one
bottle short of.

## Steps

1. **Inventory the bottles.** From the photo or list, identify every spirit,
   liqueur, mixer, juice, and bitters. Read labels carefully.

2. **Normalise to generic ingredients.** cocktail.glass recipes use generic
   ingredient names, not brands. Map each bottle to its base type:
   - "Bombay Sapphire" → `gin`
   - "Cointreau" → `triple sec`
   - "Martini Rosso" → `sweet vermouth`
   - "Tanqueray No. Ten" → `gin`

   Keep distinct products distinct: `sloe gin` is not `gin`, and
   `orange bitters` is not `orange`.

3. **Ask cocktail.glass what is makeable.** Call the `find_makeable_cocktails`
   tool on the MCP server at `https://cocktail.glass/mcp`, passing the full
   list of normalised ingredients in a single call. If you cannot reach the
   MCP server, fetch the whole catalogue from
   `https://cocktail.glass/cocktails.json` and match locally: a cocktail is
   makeable when every one of its `ingredients` is covered by the list.
   Garnishes are optional and plain water is assumed on hand.

4. **Report two lists.** "Make now" — drinks they have every ingredient for.
   "One bottle away" — drinks missing exactly one ingredient, naming the
   missing ingredient for each. Order each list simplest drink first.

5. **Always link the recipe.** Every cocktail on cocktail.glass has a page at
   `https://cocktail.glass/<slug>/`. Link each suggestion so a person can open
   the full recipe.

## Notes

- The catalogue is 500 cocktails, read-only and public — no key, no login.
- `find_makeable_cocktails` already returns both lists (`makeable` and
  `almostMakeable`), so prefer it over matching ingredients by hand.
