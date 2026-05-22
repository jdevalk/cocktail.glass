---
name: substitute-an-ingredient
description: Decide whether a cocktail ingredient can be swapped for one on hand, and find adjacent drinks with cocktail.glass.
---

# Substitute an ingredient

A recipe asks for an ingredient the person does not have. Decide whether a
swap is safe, and if it is not, use cocktail.glass to find a drink that fits
what they do have.

## Judging a substitution

Not every swap works. Use these rules of thumb:

- **Same family, similar role — usually safe.** Bourbon for rye, one London
  dry gin for another, light rum for a different light rum. Expect a shift in
  emphasis, not a broken drink.
- **Same family, different intensity — works with care.** An aged rum for a
  light one, reposado tequila for blanco: the drink survives but turns
  heavier or oakier. Say so.
- **A modifier or bittering agent — do not swap blindly.** Campari,
  Chartreuse, absinthe, and the bitters each define the drinks they are in.
  Replacing them turns the cocktail into a different one.
- **Citrus is not interchangeable.** Lemon and lime behave differently;
  swapping one for the other rebalances the drink.

When a swap only shifts emphasis, suggest it and name the effect. When it
would change the character of the drink, say so plainly.

## Finding an adjacent drink instead

If no safe swap exists, do not force it — find a different cocktail that uses
what the person already has. On the MCP server at `https://cocktail.glass/mcp`:

- `find_cocktails_by_ingredient` — every drink built on an ingredient they do
  have. Good for "I have mezcal, what else can I make."
- `find_makeable_cocktails` — pass everything on hand and get the drinks that
  need no substitution at all.
- `get_cocktail_recipe` — re-check the original recipe's other ingredients
  before recommending a swap, so the whole drink still balances.

The catalogue is also one JSON file at `https://cocktail.glass/cocktails.json`
if you cannot reach the MCP server.

## Always

Link any cocktail you suggest to its page at `https://cocktail.glass/<slug>/`
so a person can open the full recipe.
