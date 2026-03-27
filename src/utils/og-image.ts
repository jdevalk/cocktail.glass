import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import satori from 'satori';
import sharp from 'sharp';
import { getGlassServingText } from './glass.ts';

const OG_WIDTH = 1200;
const OG_HEIGHT = 630;

let displayFont: Buffer | null = null;
let bodyFont: Buffer | null = null;

const HOMEPAGE_FEATURED_SLUGS = [
    'negroni',
    'espresso-martini',
    'margarita',
    'old-fashioned',
    'martini',
    'mai-tai',
];

function loadFonts() {
    if (!displayFont) {
        displayFont = readFileSync(join(process.cwd(), 'public/fonts/PlayfairDisplay-Bold.ttf'));
    }
    if (!bodyFont) {
        bodyFont = readFileSync(join(process.cwd(), 'public/fonts/DMSans-SemiBold.ttf'));
    }
    return { displayFont, bodyFont };
}

async function renderImageDataUri(imagePath: string, width: number, height: number): Promise<string | null> {
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

async function renderCocktailImageDataUri(slug: string, width: number, height: number): Promise<string | null> {
    const imagePath = join(process.cwd(), 'public/images', `${slug}.webp`);
    return renderImageDataUri(imagePath, width, height);
}

async function renderEmojiDataUri(name: string, width: number, height: number): Promise<string | null> {
    const imagePath = join(process.cwd(), 'public/emoji', name);
    return renderImageDataUri(imagePath, width, height);
}

async function renderFeaturedHomepageImages() {
    const images = await Promise.all(
        HOMEPAGE_FEATURED_SLUGS.map(async (slug) => {
            const src = await renderCocktailImageDataUri(slug, 240, 320);
            return src ? { slug, src } : null;
        }),
    );

    return images.filter((image): image is { slug: string; src: string } => image !== null);
}

async function renderJpeg(markup: Record<string, unknown>) {
    const fonts = loadFonts();

    const svg = await satori(markup, {
        width: OG_WIDTH,
        height: OG_HEIGHT,
        fonts: [
            { name: 'PlayfairDisplay', data: fonts.displayFont!, style: 'normal', weight: 700 },
            { name: 'DMSans', data: fonts.bodyFont!, style: 'normal', weight: 600 },
        ],
    });

    return sharp(Buffer.from(svg)).jpeg({ quality: 90 }).toBuffer();
}

export async function generateOgImage(
    name: string,
    category: string,
    glass: string,
    slug: string,
): Promise<Buffer> {
    const cocktailImageBase64 = await renderCocktailImageDataUri(slug, 520, 520);
    const hasRenderableImage = Boolean(cocktailImageBase64);

    const markup = {
        type: 'div',
        props: {
            style: {
                width: OG_WIDTH,
                height: OG_HEIGHT,
                display: 'flex',
                position: 'relative' as const,
                background: 'linear-gradient(135deg, #ffecd2 0%, #fcb69f 30%, #fbc2eb 60%, #a6c1ee 100%)',
            },
            children: [
                // Left side: text content
                {
                    type: 'div',
                    props: {
                        style: {
                            display: 'flex',
                            flexDirection: 'column' as const,
                            justifyContent: 'center' as const,
                            padding: '60px',
                            width: hasRenderableImage ? '600px' : '100%',
                            position: 'relative' as const,
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
                                        textTransform: 'uppercase' as const,
                                        letterSpacing: '0.08em',
                                        marginBottom: '12px',
                                        fontFamily: 'DMSans',
                                    },
                                    children: category,
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
                                    children: name,
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
                                    children: `Served in ${getGlassServingText(glass)}`,
                                },
                            },
                        ],
                    },
                },
                // Right side: cocktail image
                ...(hasRenderableImage
                    ? [
                          {
                              type: 'div',
                              props: {
                                  style: {
                                      display: 'flex',
                                      alignItems: 'center' as const,
                                      justifyContent: 'center' as const,
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
                // Branding bottom-right
                {
                    type: 'div',
                    props: {
                        style: {
                            position: 'absolute' as const,
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

export async function generateHomepageOgImage(): Promise<Buffer> {
    const featuredImages = await renderFeaturedHomepageImages();
    const cocktailEmoji = await renderEmojiDataUri('cocktail-glass.svg', 84, 84);

    const markup = {
        type: 'div',
        props: {
            style: {
                width: OG_WIDTH,
                height: OG_HEIGHT,
                display: 'flex',
                position: 'relative' as const,
                overflow: 'hidden' as const,
                background:
                    'radial-gradient(circle at top left, rgba(255, 255, 255, 0.65), rgba(255, 255, 255, 0) 34%), linear-gradient(135deg, #ffecd2 0%, #fcb69f 24%, #fbc2eb 58%, #a6c1ee 100%)',
            },
            children: [
                {
                    type: 'div',
                    props: {
                        style: {
                            position: 'absolute' as const,
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
                            flexDirection: 'column' as const,
                            justifyContent: 'center' as const,
                            padding: '64px 48px 64px 72px',
                            position: 'relative' as const,
                        },
                        children: [
                            {
                                type: 'div',
                                props: {
                                    style: {
                                        display: 'flex',
                                        gap: '12px',
                                        alignItems: 'center' as const,
                                        alignSelf: 'flex-start' as const,
                                        marginBottom: '22px',
                                        padding: '10px 18px',
                                        borderRadius: 999,
                                        background: 'rgba(255, 255, 255, 0.58)',
                                        border: '1px solid rgba(255, 255, 255, 0.72)',
                                        color: '#a24f37',
                                        fontFamily: 'DMSans',
                                        fontSize: 20,
                                        letterSpacing: '0.08em',
                                        textTransform: 'uppercase' as const,
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
                                        flexWrap: 'wrap' as const,
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
                            alignItems: 'center' as const,
                            justifyContent: 'center' as const,
                            padding: '52px 54px 52px 0',
                            position: 'relative' as const,
                        },
                        children: [
                            {
                                type: 'div',
                                props: {
                                    style: {
                                        width: 432,
                                        height: 462,
                                        display: 'flex',
                                        flexWrap: 'wrap' as const,
                                        alignContent: 'flex-start' as const,
                                        gap: '14px',
                                        padding: '24px',
                                        borderRadius: 34,
                                        background:
                                            'linear-gradient(180deg, rgba(255, 255, 255, 0.4), rgba(255, 255, 255, 0.22))',
                                        border: '1px solid rgba(255, 255, 255, 0.5)',
                                        boxShadow: '0 28px 60px rgba(81, 56, 41, 0.16)',
                                        backdropFilter: 'blur(18px)',
                                    },
                                    children:
                                        featuredImages.length > 0
                                            ? featuredImages.map((image, index) => ({
                                                  type: 'div',
                                                  props: {
                                                      style: {
                                                          width: '118px',
                                                          height: '200px',
                                                          display: 'flex',
                                                          overflow: 'hidden' as const,
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
                                                                  objectFit: 'cover' as const,
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
                                                          alignItems: 'center' as const,
                                                          justifyContent: 'center' as const,
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
