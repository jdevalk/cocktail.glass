const proseGlassNames: Record<string, string> = {
  'Collins': 'Collins glass',
  'Copper mug': 'copper mug',
  'Coupe': 'coupe glass',
  'Flute': 'flute',
  'Highball': 'highball glass',
  'Hurricane': 'hurricane glass',
  'Irish coffee glass': 'Irish coffee glass',
  'Margarita glass': 'margarita glass',
  'Martini': 'martini glass',
  'Nick & Nora': 'Nick & Nora glass',
  'Old Fashioned glass': 'old-fashioned glass',
  'Punch bowl': 'punch bowl',
  'Shot glass': 'shot glass',
  'Snifter': 'snifter',
  'Tiki mug': 'tiki mug',
  'Wine glass': 'wine glass',
};

function needsArticleAn(phrase: string): boolean {
  return /^[aeiou]/i.test(phrase);
}

export function getGlassProseName(glass: string): string {
  return proseGlassNames[glass] || glass.toLowerCase();
}

export function getGlassServingText(glass: string): string {
  const proseName = getGlassProseName(glass);
  const article = needsArticleAn(proseName) ? 'an' : 'a';
  return `${article} ${proseName}`;
}
