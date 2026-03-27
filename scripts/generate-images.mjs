#!/usr/bin/env node

/**
 * Cocktail Image Generator for cocktail.glass
 *
 * Generates square cocktail images via OpenRouter, so you can easily switch
 * between generation models (gpt-image-1, flux, dall-e-3, etc.).
 *
 * Images are saved to public/images/{slug}.webp
 *
 * Usage:
 *   # Generate images for all cocktails missing images:
 *   node scripts/generate-images.mjs
 *
 *   # Use a specific model:
 *   IMAGE_MODEL=openai/gpt-image-1 node scripts/generate-images.mjs
 *
 *   # Generate for a specific cocktail:
 *   node scripts/generate-images.mjs --slug margarita
 *
 *   # Force regenerate (even if image exists):
 *   node scripts/generate-images.mjs --slug margarita --force
 *
 *   # Dry run (show what would be generated):
 *   node scripts/generate-images.mjs --dry-run
 *
 *   # Generate a batch of N images (default: all missing):
 *   node scripts/generate-images.mjs --batch 10
 *
 *   # Generate multiple images in parallel:
 *   node scripts/generate-images.mjs --concurrency 3
 */

import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

const ENV_PATH = path.resolve('.env');
loadEnvFile();

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
const MODEL = process.env.IMAGE_MODEL || 'google/gemini-3.1-flash-image-preview';
const API_URL = 'https://openrouter.ai/api/v1/chat/completions';
const COCKTAILS_PATH = path.resolve('cocktails.json');
const IMAGES_DIR = path.resolve('public/images');
const DEFAULT_CONCURRENCY = getPositiveInt(process.env.IMAGE_CONCURRENCY, 3);
const DEFAULT_DELAY_MS = getPositiveInt(process.env.IMAGE_DELAY_MS, 250);

function loadEnvFile() {
    if (typeof process.loadEnvFile !== 'function') return;

    try {
        process.loadEnvFile(ENV_PATH);
    } catch (error) {
        if (error?.code !== 'ENOENT') throw error;
    }
}

function getPositiveInt(value, fallback) {
    const parsed = Number.parseInt(value ?? '', 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// ============================================================
// Prompt Builder
// ============================================================

function describeGlassStyle(glass) {
    const styles = {
        'Collins': 'a tall, slim Collins glass with thin walls and an elegant silhouette',
        'Copper mug': 'a polished premium copper mug with a sophisticated finish',
        'Coupe': 'a delicate vintage-inspired coupe with a thin stem and refined bowl',
        'Flute': 'a tall, slender flute with thin crystal walls and a luxe feel',
        'Highball': 'a sleek upscale highball glass with thin walls and a crisp silhouette',
        'Hurricane': 'a graceful hurricane glass with a refined curved shape',
        'Irish coffee glass': 'a refined Irish coffee glass with a footed base and elegant handle',
        'Margarita glass': 'an elegant margarita glass with a refined stem, not oversized or tacky',
        'Martini': 'a sharp V-shaped martini glass with a long stem and fine rim',
        'Nick & Nora': 'a petite Nick & Nora glass with a curved bowl and delicate stem',
        'Punch bowl': 'an elegant polished punch bowl with upscale presentation',
        'Old Fashioned glass': 'a refined crystal old fashioned glass with a weighty base and clean lines',
        'Shot glass': 'a premium shot glass with a clean, upscale look',
        'Snifter': 'a classic crystal snifter with a rounded bowl and elegant short stem',
        'Tiki mug': 'a premium ceramic tiki mug with stylish detailing, not cartoonish',
        'Wine glass': 'a refined stemmed wine glass with a thin rim and elegant bowl',
    };

    return styles[glass] || `an upscale ${glass.toLowerCase()} glass with elegant proportions`;
}

function getGlassPromptName(glass) {
    const lowerGlass = glass.toLowerCase();
    if (/(glass|mug|bowl)$/.test(lowerGlass)) return lowerGlass;
    return `${lowerGlass} glass`;
}

function getGlassServingText(glass) {
    const promptName = getGlassPromptName(glass).replace('old fashioned glass', 'old-fashioned glass');
    const article = /^[aeiou]/i.test(promptName) ? 'an' : 'a';
    return `${article} ${promptName}`;
}

function buildPrompt(cocktail) {
    const { name, glass, ingredients, garnish } = cocktail;
    const ingredientNames = ingredients.map(i => i.name).join(', ');
    const glassStyle = describeGlassStyle(glass);
    const glassPromptName = getGlassPromptName(glass);

    return `A beautiful studio photograph of a ${name} cocktail served in ${getGlassServingText(glass)}.

STYLE (follow exactly):
- Clean, professional cocktail photography on the same consistent background every time: a seamless pale cool light-gray stone or plaster studio backdrop
- Background should fill the full frame and stay minimal, editorial, premium, and softly textured
- Choose a background tone that contrasts clearly with the drink so the glass, liquid, and garnish stand out at a glance
- The cocktail must be visually distinct from the background, with strong separation in brightness and color temperature
- Studio shot only, not a real bar, restaurant, kitchen, patio, or home interior
- No windows, no shelves, no room details, no scenery, no people, no hands
- No tabletop clutter, no bottles, no napkins, no straws unless specified, no extra props, no busy decor
- If a surface is visible, it should be the same neutral pale cool light-gray studio surface with nothing else on it
- Shot from a slight angle, showing the glass and drink clearly
- Beautiful natural lighting with soft shadows
- The drink should look fresh, cold, and appetizing
- Show the correct color and opacity for this specific cocktail
- The glass should be the correct type: ${glassPromptName}
- Glass styling: ${glassStyle}
- The glassware should feel chic, upscale, and design-forward
- Avoid cheap, clunky, novelty, or overly thick glassware unless the drink specifically calls for it
${garnish ? `- Garnished with: ${garnish}` : '- No garnish, clean presentation'}
- Key ingredients for color reference: ${ingredientNames}
- Square format, centered composition with some breathing room
- No text, no labels, no watermarks
- Photorealistic, high quality, appetizing`;
}

// ============================================================
// Image Generation via OpenRouter
// ============================================================

async function generateImage(prompt) {
    const body = {
        model: MODEL,
        messages: [{ role: 'user', content: prompt }],
        modalities: ['image', 'text'],
        stream: false,
        image_config: {
            aspect_ratio: '1:1',
            image_size: '1K',
        },
    };

    const response = await fetch(API_URL, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
            'HTTP-Referer': 'https://cocktail.glass',
            'X-Title': 'cocktail.glass image generator',
        },
        body: JSON.stringify(body),
    });

    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`OpenRouter API error ${response.status}: ${errorText}`);
    }

    const data = await response.json();

    const imageUrl = data.choices?.[0]?.message?.images?.[0]?.image_url?.url;
    if (!imageUrl) {
        throw new Error('No image generated — the API returned no image data.');
    }

    if (imageUrl.startsWith('data:')) {
        const [, base64] = imageUrl.split(',', 2);
        if (!base64) throw new Error('Invalid data URL returned by OpenRouter.');
        return Buffer.from(base64, 'base64');
    } else {
        const imgResponse = await fetch(imageUrl);
        if (!imgResponse.ok) throw new Error(`Failed to download image from ${imageUrl}`);
        return Buffer.from(await imgResponse.arrayBuffer());
    }
}

// ============================================================
// Main
// ============================================================

async function main() {
    const args = process.argv.slice(2);
    const targetSlug = args.includes('--slug') ? args[args.indexOf('--slug') + 1] : null;
    const force = args.includes('--force');
    const dryRun = args.includes('--dry-run');
    const batchSize = args.includes('--batch') ? parseInt(args[args.indexOf('--batch') + 1]) : null;
    const concurrency = args.includes('--concurrency')
        ? getPositiveInt(args[args.indexOf('--concurrency') + 1], DEFAULT_CONCURRENCY)
        : DEFAULT_CONCURRENCY;
    const delayMs = args.includes('--delay-ms')
        ? getPositiveInt(args[args.indexOf('--delay-ms') + 1], DEFAULT_DELAY_MS)
        : DEFAULT_DELAY_MS;

    if (!dryRun && !OPENROUTER_API_KEY) {
        console.error('Error: OPENROUTER_API_KEY environment variable is required.');
        console.error('Add OPENROUTER_API_KEY to .env or your shell environment.');
        process.exit(1);
    }

    const cocktails = JSON.parse(fs.readFileSync(COCKTAILS_PATH, 'utf8'));
    console.log(`Loaded ${cocktails.length} cocktails.`);

    fs.mkdirSync(IMAGES_DIR, { recursive: true });

    // Filter cocktails that need images
    let toGenerate = cocktails.filter(c => {
        if (targetSlug) return c.slug === targetSlug;
        if (force) return true;
        const imagePath = path.join(IMAGES_DIR, `${c.slug}.webp`);
        return !fs.existsSync(imagePath);
    });

    if (targetSlug && toGenerate.length === 0) {
        console.error(`Cocktail with slug "${targetSlug}" not found.`);
        process.exit(1);
    }

    if (batchSize && batchSize < toGenerate.length) {
        toGenerate = toGenerate.slice(0, batchSize);
    }

    console.log(`Cocktails to generate: ${toGenerate.length}\n`);

    if (dryRun) {
        for (const cocktail of toGenerate) {
            const imagePath = path.join(IMAGES_DIR, `${cocktail.slug}.webp`);
            const exists = fs.existsSync(imagePath);
            console.log(`  [DRY RUN] ${cocktail.slug}`);
            console.log(`            ${cocktail.name} — ${cocktail.glass}`);
            console.log(`            Has image: ${exists}\n`);
        }
        console.log(`Total: ${toGenerate.length} images to generate.`);
        return;
    }

    console.log(`Using model: ${MODEL}\n`);
    console.log(`Concurrency: ${concurrency}`);
    console.log(`Delay between launches: ${delayMs}ms\n`);

    let generated = 0;
    let failed = 0;

    async function processCocktail(cocktail, index) {
        const prompt = buildPrompt(cocktail);
        const outputPath = path.join(IMAGES_DIR, `${cocktail.slug}.webp`);

        console.log(`[${index}/${toGenerate.length}] ${cocktail.name}`);

        try {
            const pngBuffer = await generateImage(prompt);

            // Convert to webp for smaller file size
            await sharp(pngBuffer)
                .resize(1024, 1024, { fit: 'cover' })
                .webp({ quality: 85 })
                .toFile(outputPath);

            const stats = fs.statSync(outputPath);
            console.log(`  Saved: ${outputPath} (${Math.round(stats.size / 1024)}KB)`);
            generated++;
        } catch (err) {
            console.error(`  FAILED: ${err.message}`);
            failed++;
        }
    }

    for (let offset = 0; offset < toGenerate.length; offset += concurrency) {
        const chunk = toGenerate.slice(offset, offset + concurrency);

        await Promise.all(
            chunk.map(async (cocktail, chunkIndex) => {
                if (delayMs > 0 && chunkIndex > 0) {
                    await sleep(delayMs * chunkIndex);
                }

                await processCocktail(cocktail, offset + chunkIndex + 1);
            }),
        );

        if (delayMs > 0 && offset + concurrency < toGenerate.length) {
            await sleep(delayMs);
        }
    }

    console.log(`\nDone! Generated: ${generated}, Failed: ${failed}`);
}

main().catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
});
