#!/usr/bin/env node

import { existsSync, readFileSync } from 'node:fs';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import satori from 'satori';
import sharp from 'sharp';

const cwd = process.cwd();
const scriptPath = fileURLToPath(import.meta.url);

const OG_WIDTH = 1200;
const OG_HEIGHT = 630;
const HOMEPAGE_FEATURED_SLUGS = [
  'negroni',
  'espresso-martini',
  'margarita',
  'old-fashioned',
  'martini',
  'mai-tai',
];

const COCKTAILS_PATH = join(cwd, 'cocktails.json');
const IMAGES_DIR = join(cwd, 'public', 'images');
const OUTPUT_DIR = join(cwd, 'public', 'og');
const DISPLAY_FONT_PATH = join(cwd, 'public', 'fonts', 'PlayfairDisplay-Bold.ttf');
const BODY_FONT_PATH = join(cwd, 'public', 'fonts', 'DMSans-SemiBold.ttf');
const EMOJI_PATH = join(cwd, 'public', 'emoji', 'cocktail-glass.svg');

let displayFont = null;
let bodyFont = null;

function getGlassProseName(glass) {
  const proseGlassNames = {
    Collins: 'Collins glass',
    'Copper mug': 'copper mug',
    Coupe: 'coupe glass',
    Flute: 'flute',
    Highball: 'highball glass',
    Hurricane: 'hurricane glass',
    'Irish coffee glass': 'Irish coffee glass',
    'Margarita glass': 'margarita glass',
    Martini: 'martini glass',
    'Nick & Nora': 'Nick & Nora glass',
    'Tumbler': 'tumbler',
    'Punch bowl': 'punch bowl',
    'Shot glass': 'shot glass',
    Snifter: 'snifter',
    'Tiki mug': 'tiki mug',
    'Wine glass': 'wine glass',
  };

  return proseGlassNames[glass] || glass.toLowerCase();
}

function getGlassServingText(glass) {
  const proseName = getGlassProseName(glass);
  const article = /^[aeiou]/i.test(proseName) ? 'an' : 'a';
  return `${article} ${proseName}`;
}

function parseArgs() {
  const args = process.argv.slice(2);
  const force = args.includes('--force');
  const homepageOnly = args.includes('--homepage-only');
  const slugIndex = args.indexOf('--slug');
  const slug = slugIndex >= 0 ? args[slugIndex + 1] : null;

  if (slugIndex >= 0 && !slug) {
    throw new Error('Missing value for --slug.');
  }

  if (homepageOnly && slug) {
    throw new Error('Use either --homepage-only or --slug, not both.');
  }

  return { force, homepageOnly, slug };
}

function loadFonts() {
  if (!displayFont) {
    displayFont = readFileSync(DISPLAY_FONT_PATH);
  }

  if (!bodyFont) {
    bodyFont = readFileSync(BODY_FONT_PATH);
  }

  return { displayFont, bodyFont };
}

async function readCocktails() {
  return JSON.parse(await readFile(COCKTAILS_PATH, 'utf8'));
}

async function readStats(filePath) {
  try {
    return await stat(filePath);
  } catch {
    return null;
  }
}

async function isUpToDate(outputPath, dependencyPaths) {
  const outputStats = await readStats(outputPath);
  if (!outputStats) {
    return false;
  }

  for (const dependencyPath of dependencyPaths) {
    const dependencyStats = await readStats(dependencyPath);
    if (dependencyStats && dependencyStats.mtimeMs > outputStats.mtimeMs) {
      return false;
    }
  }

  return true;
}

async function renderImageDataUri(imagePath, width, height) {
  if (!existsSync(imagePath)) {
    return null;
  }

  try {
    const imageBuffer = await sharp(imagePath)
      .resize(width, height, { fit: 'cover' })
      .png()
      .toBuffer();

    return `data:image/png;base64,${imageBuffer.toString('base64')}`;
  } catch {
    return null;
  }
}

async function renderCocktailImageDataUri(slug, width, height) {
  return renderImageDataUri(join(IMAGES_DIR, `${slug}.webp`), width, height);
}

async function renderEmojiDataUri(width, height) {
  return renderImageDataUri(EMOJI_PATH, width, height);
}

async function renderFeaturedHomepageImages() {
  const images = await Promise.all(
    HOMEPAGE_FEATURED_SLUGS.map(async (slug) => {
      const src = await renderCocktailImageDataUri(slug, 240, 320);
      return src ? { slug, src } : null;
    }),
  );

  return images.filter(Boolean);
}

async function renderJpeg(markup) {
  const fonts = loadFonts();
  const svg = await satori(markup, {
    width: OG_WIDTH,
    height: OG_HEIGHT,
    fonts: [
      { name: 'PlayfairDisplay', data: fonts.displayFont, style: 'normal', weight: 700 },
      { name: 'DMSans', data: fonts.bodyFont, style: 'normal', weight: 600 },
    ],
  });

  return sharp(Buffer.from(svg)).jpeg({ quality: 90 }).toBuffer();
}

async function generateCocktailOgImage(cocktail) {
  const cocktailImageBase64 = await renderCocktailImageDataUri(cocktail.slug, 520, 520);
  const hasRenderableImage = Boolean(cocktailImageBase64);

  const markup = {
    type: 'div',
    props: {
      style: {
        width: OG_WIDTH,
        height: OG_HEIGHT,
        display: 'flex',
        position: 'relative',
        background: 'linear-gradient(135deg, #ffecd2 0%, #fcb69f 30%, #fbc2eb 60%, #a6c1ee 100%)',
      },
      children: [
        {
          type: 'div',
          props: {
            style: {
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'center',
              padding: '60px',
              width: hasRenderableImage ? '600px' : '100%',
              position: 'relative',
            },
            children: [
              {
                type: 'div',
                props: {
                  style: {
                    display: 'flex',
                    fontSize: 20,
                    color: '#e05e3a',
                    fontWeight: 600,
                    textTransform: 'uppercase',
                    letterSpacing: '0.08em',
                    marginBottom: '12px',
                    fontFamily: 'DMSans',
                  },
                  children: cocktail.category,
                },
              },
              {
                type: 'div',
                props: {
                  style: {
                    display: 'flex',
                    fontSize: 64,
                    fontWeight: 700,
                    color: '#2d2a26',
                    lineHeight: 1.1,
                    fontFamily: 'PlayfairDisplay',
                    marginBottom: '16px',
                  },
                  children: cocktail.name,
                },
              },
              {
                type: 'div',
                props: {
                  style: {
                    display: 'flex',
                    fontSize: 22,
                    color: '#7a7267',
                    fontFamily: 'DMSans',
                  },
                  children: `Served in ${getGlassServingText(cocktail.glass)}`,
                },
              },
            ],
          },
        },
        ...(hasRenderableImage
          ? [
              {
                type: 'div',
                props: {
                  style: {
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    width: '600px',
                    padding: '40px',
                  },
                  children: [
                    {
                      type: 'img',
                      props: {
                        src: cocktailImageBase64,
                        width: 480,
                        height: 480,
                        style: {
                          borderRadius: 32,
                        },
                      },
                    },
                  ],
                },
              },
            ]
          : []),
        {
          type: 'div',
          props: {
            style: {
              position: 'absolute',
              bottom: '24px',
              right: '40px',
              display: 'flex',
              fontSize: 22,
              color: 'rgba(45, 42, 38, 0.5)',
              fontWeight: 600,
              fontFamily: 'PlayfairDisplay',
            },
            children: 'cocktail.glass',
          },
        },
      ],
    },
  };

  return renderJpeg(markup);
}

async function generateHomepageOgImage() {
  const featuredImages = await renderFeaturedHomepageImages();
  const cocktailEmoji = await renderEmojiDataUri(84, 84);

  const markup = {
    type: 'div',
    props: {
      style: {
        width: OG_WIDTH,
        height: OG_HEIGHT,
        display: 'flex',
        position: 'relative',
        overflow: 'hidden',
        background:
          'radial-gradient(circle at top left, rgba(255, 255, 255, 0.65), rgba(255, 255, 255, 0) 34%), linear-gradient(135deg, #ffecd2 0%, #fcb69f 24%, #fbc2eb 58%, #a6c1ee 100%)',
      },
      children: [
        {
          type: 'div',
          props: {
            style: {
              position: 'absolute',
              inset: 0,
              background:
                'radial-gradient(circle at 18% 22%, rgba(255, 255, 255, 0.34), rgba(255, 255, 255, 0) 28%), radial-gradient(circle at 78% 14%, rgba(255, 255, 255, 0.22), rgba(255, 255, 255, 0) 24%), radial-gradient(circle at 86% 84%, rgba(255, 255, 255, 0.18), rgba(255, 255, 255, 0) 20%)',
            },
          },
        },
        {
          type: 'div',
          props: {
            style: {
              width: '58%',
              height: '100%',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'center',
              padding: '64px 48px 64px 72px',
              position: 'relative',
            },
            children: [
              {
                type: 'div',
                props: {
                  style: {
                    display: 'flex',
                    gap: '12px',
                    alignItems: 'center',
                    alignSelf: 'flex-start',
                    marginBottom: '22px',
                    padding: '10px 18px',
                    borderRadius: 999,
                    background: 'rgba(255, 255, 255, 0.58)',
                    border: '1px solid rgba(255, 255, 255, 0.72)',
                    color: '#a24f37',
                    fontFamily: 'DMSans',
                    fontSize: 20,
                    letterSpacing: '0.08em',
                    textTransform: 'uppercase',
                  },
                  children: [
                    ...(cocktailEmoji
                      ? [
                          {
                            type: 'img',
                            props: {
                              src: cocktailEmoji,
                              width: 24,
                              height: 24,
                              style: {
                                flexShrink: 0,
                              },
                            },
                          },
                        ]
                      : []),
                    {
                      type: 'span',
                      props: {
                        children: '500 cocktail recipes',
                      },
                    },
                  ],
                },
              },
              {
                type: 'div',
                props: {
                  style: {
                    display: 'flex',
                    fontFamily: 'PlayfairDisplay',
                    fontSize: 86,
                    lineHeight: 0.98,
                    color: '#2d2a26',
                    marginBottom: '18px',
                    letterSpacing: '-0.04em',
                  },
                  children: 'cocktail.glass',
                },
              },
              {
                type: 'div',
                props: {
                  style: {
                    display: 'flex',
                    maxWidth: 520,
                    fontFamily: 'DMSans',
                    fontSize: 28,
                    lineHeight: 1.35,
                    color: '#4d463f',
                    marginBottom: '28px',
                  },
                  children: 'Browse by category, glass, and ingredient to find your next favorite drink fast.',
                },
              },
              {
                type: 'div',
                props: {
                  style: {
                    display: 'flex',
                    gap: '12px',
                    flexWrap: 'wrap',
                  },
                  children: ['Category filters', 'Glassware', 'Ingredient search'].map((label) => ({
                    type: 'div',
                    props: {
                      style: {
                        display: 'flex',
                        padding: '12px 18px',
                        borderRadius: 999,
                        background: 'rgba(45, 42, 38, 0.08)',
                        color: '#2d2a26',
                        fontFamily: 'DMSans',
                        fontSize: 20,
                      },
                      children: label,
                    },
                  })),
                },
              },
            ],
          },
        },
        {
          type: 'div',
          props: {
            style: {
              width: '42%',
              height: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '52px 54px 52px 0',
              position: 'relative',
            },
            children: [
              {
                type: 'div',
                props: {
                  style: {
                    width: 432,
                    height: 462,
                    display: 'flex',
                    flexWrap: 'wrap',
                    alignContent: 'flex-start',
                    gap: '14px',
                    padding: '24px',
                    borderRadius: 34,
                    background: 'linear-gradient(180deg, rgba(255, 255, 255, 0.4), rgba(255, 255, 255, 0.22))',
                    border: '1px solid rgba(255, 255, 255, 0.5)',
                    boxShadow: '0 28px 60px rgba(81, 56, 41, 0.16)',
                    backdropFilter: 'blur(18px)',
                  },
                  children:
                    featuredImages.length > 0
                      ? featuredImages.map((image) => ({
                          type: 'div',
                          props: {
                            style: {
                              width: '118px',
                              height: '200px',
                              display: 'flex',
                              overflow: 'hidden',
                              borderRadius: 24,
                              background: 'rgba(255, 255, 255, 0.85)',
                              boxShadow: '0 12px 24px rgba(45, 42, 38, 0.10)',
                            },
                            children: {
                              type: 'img',
                              props: {
                                src: image.src,
                                width: 118,
                                height: 200,
                                style: {
                                  width: '100%',
                                  height: '100%',
                                  objectFit: 'cover',
                                },
                              },
                            },
                          },
                        }))
                      : {
                          type: 'div',
                          props: {
                            style: {
                              width: '100%',
                              height: '100%',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              borderRadius: 26,
                              background: 'rgba(255, 255, 255, 0.5)',
                              color: '#7a7267',
                              fontFamily: 'DMSans',
                              fontSize: 28,
                            },
                            children: '500 recipes',
                          },
                        },
                },
              },
            ],
          },
        },
      ],
    },
  };

  return renderJpeg(markup);
}

async function generateHomepage({ force }) {
  const outputPath = join(OUTPUT_DIR, 'home.jpg');
  const dependencies = [
    scriptPath,
    COCKTAILS_PATH,
    DISPLAY_FONT_PATH,
    BODY_FONT_PATH,
    EMOJI_PATH,
    ...HOMEPAGE_FEATURED_SLUGS.map((slug) => join(IMAGES_DIR, `${slug}.webp`)),
  ];

  if (!force && await isUpToDate(outputPath, dependencies)) {
    return 'skipped';
  }

  const jpg = await generateHomepageOgImage();
  await writeFile(outputPath, jpg);
  return 'generated';
}

async function generateCocktail(cocktail, { force }) {
  const outputPath = join(OUTPUT_DIR, `${cocktail.slug}.jpg`);
  const dependencies = [
    scriptPath,
    COCKTAILS_PATH,
    DISPLAY_FONT_PATH,
    BODY_FONT_PATH,
    join(IMAGES_DIR, `${cocktail.slug}.webp`),
  ];

  if (!force && await isUpToDate(outputPath, dependencies)) {
    return 'skipped';
  }

  const jpg = await generateCocktailOgImage(cocktail);
  await writeFile(outputPath, jpg);
  return 'generated';
}

async function main() {
  const options = parseArgs();
  const cocktails = await readCocktails();

  await mkdir(OUTPUT_DIR, { recursive: true });

  let generated = 0;
  let skipped = 0;

  if (options.homepageOnly) {
    const result = await generateHomepage(options);
    console.log(`Homepage OG image: ${result}.`);
    return;
  }

  if (!options.slug) {
    const homepageResult = await generateHomepage(options);
    if (homepageResult === 'generated') {
      generated += 1;
    } else {
      skipped += 1;
    }
  }

  const targets = options.slug
    ? cocktails.filter((cocktail) => cocktail.slug === options.slug)
    : cocktails;

  if (options.slug && targets.length === 0) {
    throw new Error(`Cocktail with slug "${options.slug}" not found.`);
  }

  for (const cocktail of targets) {
    const result = await generateCocktail(cocktail, options);
    if (result === 'generated') {
      generated += 1;
    } else {
      skipped += 1;
    }
  }

  console.log(`OG images complete. Generated ${generated}, skipped ${skipped}.`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
