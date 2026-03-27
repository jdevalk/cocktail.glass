import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import satori from 'satori';
import sharp from 'sharp';
import { getGlassServingText } from './glass';

const OG_WIDTH = 1200;
const OG_HEIGHT = 630;

let displayFont: Buffer | null = null;
let bodyFont: Buffer | null = null;

function loadFonts() {
    if (!displayFont) {
        displayFont = readFileSync(join(process.cwd(), 'public/fonts/PlayfairDisplay-Bold.ttf'));
    }
    if (!bodyFont) {
        bodyFont = readFileSync(join(process.cwd(), 'public/fonts/DMSans-SemiBold.ttf'));
    }
    return { displayFont, bodyFont };
}

export async function generateOgImage(
    name: string,
    category: string,
    glass: string,
    slug: string,
): Promise<Buffer> {
    const fonts = loadFonts();

    // Check if cocktail image exists
    const imagePath = join(process.cwd(), 'public/images', `${slug}.webp`);
    const hasImage = existsSync(imagePath);

    // Prepare the cocktail image as base64 if available
    let cocktailImageBase64 = '';
    let hasRenderableImage = false;
    if (hasImage) {
        try {
            const imageBuffer = await sharp(imagePath)
                .resize(520, 520, { fit: 'cover' })
                .png()
                .toBuffer();
            cocktailImageBase64 = `data:image/png;base64,${imageBuffer.toString('base64')}`;
            hasRenderableImage = true;
        } catch {
            cocktailImageBase64 = '';
        }
    }

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

    const svg = await satori(markup, {
        width: OG_WIDTH,
        height: OG_HEIGHT,
        fonts: [
            { name: 'PlayfairDisplay', data: fonts.displayFont!, style: 'normal', weight: 700 },
            { name: 'DMSans', data: fonts.bodyFont!, style: 'normal', weight: 600 },
        ],
    });

    return await sharp(Buffer.from(svg)).jpeg({ quality: 90 }).toBuffer();
}
