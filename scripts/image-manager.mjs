#!/usr/bin/env node

/**
 * Cocktail Image Manager for cocktail.glass
 *
 * A local web UI to:
 * - See all 500 cocktails and their image status
 * - Copy generation prompts (for ChatGPT or other tools)
 * - Generate images directly via OpenRouter
 * - Drag & drop images onto cocktails
 * - Preview OG images
 *
 * Usage: node scripts/image-manager.mjs
 * Then open http://localhost:3457
 *
 * Environment variables:
 *   OPENROUTER_API_KEY  - Required for in-UI generation
 *   IMAGE_MODEL         - OpenRouter model (default: openai/gpt-image-1)
 */

import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import sharp from 'sharp';
import satori from 'satori';

const PORT = 3457;
const ENV_PATH = path.resolve('.env');
const COCKTAILS_PATH = path.resolve('cocktails.json');
const IMAGES_DIR = path.resolve('public/images');
const OG_DIR = path.resolve('dist/og');

loadEnvFile();

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
const IMAGE_MODEL = process.env.IMAGE_MODEL || 'google/gemini-3.1-flash-image-preview';
const OPENROUTER_API_URL = 'https://openrouter.ai/api/v1/chat/completions';

function loadEnvFile() {
    if (typeof process.loadEnvFile !== 'function') return;

    try {
        process.loadEnvFile(ENV_PATH);
    } catch (error) {
        if (error?.code !== 'ENOENT') throw error;
    }
}

// ============================================================
// Data
// ============================================================

function loadCocktails() {
    return JSON.parse(fs.readFileSync(COCKTAILS_PATH, 'utf8'));
}

function hasImage(slug) {
    return fs.existsSync(path.join(IMAGES_DIR, `${slug}.webp`));
}

// ============================================================
// Prompt Builder (matches generate-images.mjs)
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
// OG Image Generation (mirrors src/utils/og-image.ts)
// ============================================================

const OG_WIDTH = 1200;
const OG_HEIGHT = 630;

let displayFont = null;
let bodyFont = null;

function loadFonts() {
    if (!displayFont) displayFont = fs.readFileSync(path.resolve('public/fonts/PlayfairDisplay-Bold.ttf'));
    if (!bodyFont) bodyFont = fs.readFileSync(path.resolve('public/fonts/DMSans-SemiBold.ttf'));
}

async function generateOgImage(cocktail, cocktailImageBuffer) {
    loadFonts();

    let cocktailImageBase64 = '';
    if (cocktailImageBuffer) {
        const resized = await sharp(cocktailImageBuffer).resize(520, 520, { fit: 'cover' }).png().toBuffer();
        cocktailImageBase64 = `data:image/png;base64,${resized.toString('base64')}`;
    }

    const hasImg = !!cocktailImageBase64;

    const markup = {
        type: 'div',
        props: {
            style: { width: OG_WIDTH, height: OG_HEIGHT, display: 'flex', position: 'relative', background: 'linear-gradient(135deg, #ffecd2 0%, #fcb69f 30%, #fbc2eb 60%, #a6c1ee 100%)' },
            children: [
                {
                    type: 'div',
                    props: {
                        style: { display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: '60px', width: hasImg ? '600px' : '100%', position: 'relative' },
                        children: [
                            { type: 'div', props: { style: { display: 'flex', fontSize: 20, color: '#e05e3a', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '12px', fontFamily: 'DMSans' }, children: cocktail.category } },
                            { type: 'div', props: { style: { display: 'flex', fontSize: 64, fontWeight: 700, color: '#2d2a26', lineHeight: 1.1, fontFamily: 'PlayfairDisplay', marginBottom: '16px' }, children: cocktail.name } },
                            { type: 'div', props: { style: { display: 'flex', fontSize: 22, color: '#7a7267', fontFamily: 'DMSans' }, children: `Served in ${getGlassServingText(cocktail.glass)}` } },
                        ],
                    },
                },
                ...(hasImg ? [{
                    type: 'div',
                    props: {
                        style: { display: 'flex', alignItems: 'center', justifyContent: 'center', width: '600px', padding: '40px' },
                        children: [{ type: 'img', props: { src: cocktailImageBase64, width: 480, height: 480, style: { borderRadius: 32 } } }],
                    },
                }] : []),
                { type: 'div', props: { style: { position: 'absolute', bottom: '24px', right: '40px', display: 'flex', fontSize: 22, color: 'rgba(45, 42, 38, 0.5)', fontWeight: 600, fontFamily: 'PlayfairDisplay' }, children: 'cocktail.glass' } },
            ],
        },
    };

    const svg = await satori(markup, {
        width: OG_WIDTH,
        height: OG_HEIGHT,
        fonts: [
            { name: 'PlayfairDisplay', data: displayFont, style: 'normal', weight: 700 },
            { name: 'DMSans', data: bodyFont, style: 'normal', weight: 600 },
        ],
    });

    return await sharp(Buffer.from(svg)).jpeg({ quality: 90 }).toBuffer();
}

async function generateAndSaveOg(cocktail, imageBuffer) {
    fs.mkdirSync(OG_DIR, { recursive: true });
    const ogBuffer = await generateOgImage(cocktail, imageBuffer);
    const ogPath = path.join(OG_DIR, `${cocktail.slug}.jpg`);
    fs.writeFileSync(ogPath, ogBuffer);
    return ogPath;
}

// ============================================================
// Image upload / generation handlers
// ============================================================

async function saveImage(slug, imageBuffer) {
    fs.mkdirSync(IMAGES_DIR, { recursive: true });
    const webpBuffer = await sharp(imageBuffer).resize(1024, 1024, { fit: 'cover' }).webp({ quality: 85 }).toBuffer();
    const imagePath = path.join(IMAGES_DIR, `${slug}.webp`);
    fs.writeFileSync(imagePath, webpBuffer);
    return webpBuffer;
}

async function generateViaOpenRouter(prompt) {
    if (!OPENROUTER_API_KEY) throw new Error('OPENROUTER_API_KEY not set');

    const response = await fetch(OPENROUTER_API_URL, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
            'HTTP-Referer': 'https://cocktail.glass',
            'X-Title': 'cocktail.glass image manager',
        },
        body: JSON.stringify({
            model: IMAGE_MODEL,
            messages: [{ role: 'user', content: prompt }],
            modalities: ['image', 'text'],
            stream: false,
            image_config: {
                aspect_ratio: '1:1',
                image_size: '1K',
            },
        }),
    });

    if (!response.ok) {
        const text = await response.text();
        throw new Error(`OpenRouter ${response.status}: ${text}`);
    }

    const data = await response.json();
    const imageUrl = data.choices?.[0]?.message?.images?.[0]?.image_url?.url;
    if (!imageUrl) throw new Error('No image in response');

    if (imageUrl.startsWith('data:')) {
        const [, base64] = imageUrl.split(',', 2);
        if (!base64) throw new Error('Invalid data URL in response');
        return Buffer.from(base64, 'base64');
    }

    const r = await fetch(imageUrl);
    if (!r.ok) throw new Error(`Failed to download image from ${imageUrl}`);
    return Buffer.from(await r.arrayBuffer());
}

// ============================================================
// HTML UI
// ============================================================

function renderHTML() {
    const cocktails = loadCocktails();
    const withImage = cocktails.filter(c => hasImage(c.slug)).length;

    const cards = cocktails.map(c => {
        const has = hasImage(c.slug);
        const prompt = buildPrompt(c);
        const promptEscaped = prompt.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
        return `
        <div class="cocktail ${has ? 'has-image' : 'needs-image'}" data-slug="${c.slug}" data-category="${c.category}" data-glass="${c.glass}">
            <div class="cocktail-header">
                <div class="cocktail-info">
                    <span class="status ${has ? 'done' : 'todo'}">${has ? 'Has image' : 'Needs image'}</span>
                    <span class="cat">${c.category}</span>
                    <span class="cat">${c.glass}</span>
                </div>
                <h2><a href="/${c.slug}/" target="_blank">${c.name}</a></h2>
            </div>
            <div class="cocktail-body">
                <div class="image-col">
                    <div class="drop-zone" data-slug="${c.slug}">
                        ${has
                            ? `<img src="/image/${c.slug}" alt="${c.name}" /><p class="drop-hint">Drop new image to replace</p>`
                            : `<div class="drop-placeholder"><svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M12 16V4m0 0L8 8m4-4l4 4M4 20h16"/></svg><p>Drop image here</p></div>`
                        }
                    </div>
                    <div class="og-preview" data-slug="${c.slug}">
                        <span class="og-label">OG Image</span>
                        <img src="/og/${c.slug}.jpg?${Date.now()}" alt="OG preview" onerror="this.parentElement.classList.add('no-og')" />
                        <button class="regen-btn" onclick="regenerateOg('${c.slug}', this)" title="Regenerate OG image">&#x21bb;</button>
                    </div>
                </div>
                <div class="prompt-col">
                    <textarea class="prompt-text" data-slug="${c.slug}">${promptEscaped}</textarea>
                    <div class="btn-row">
                        <button class="copy-btn" onclick="copyPrompt('${c.slug}')">Copy prompt</button>
                        <button class="generate-btn" onclick="generateImage('${c.slug}', this)">Generate</button>
                    </div>
                </div>
            </div>
        </div>`;
    }).join('\n');

    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Cocktail Image Manager</title>
<style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: #0f0f0f; color: #e0e0e0; padding: 2rem; }
    h1 { font-size: 1.5rem; margin-bottom: 0.25rem; }
    .subtitle { color: #888; margin-bottom: 1.5rem; font-size: 0.9rem; }
    .progress { margin-bottom: 1.5rem; }
    .progress-bar { height: 6px; background: #222; border-radius: 3px; overflow: hidden; margin-bottom: 0.35rem; }
    .progress-fill { height: 100%; background: linear-gradient(90deg, #e05e3a, #fcb69f); border-radius: 3px; transition: width 0.3s; }
    .progress-text { font-size: 0.8rem; color: #888; }
    .filters { display: flex; gap: 0.5rem; margin-bottom: 1.5rem; flex-wrap: wrap; }
    .filters button { padding: 0.4rem 1rem; border: 1px solid #333; border-radius: 6px; background: #1a1a1a; color: #ccc; cursor: pointer; font-size: 0.85rem; }
    .filters button.active { background: #e05e3a; border-color: #e05e3a; color: #fff; }
    .cocktail { border: 1px solid #222; border-radius: 12px; margin-bottom: 1.5rem; background: #161616; overflow: hidden; }
    .cocktail.needs-image { border-color: #4a2030; }
    .cocktail-header { padding: 1rem 1.25rem; border-bottom: 1px solid #222; }
    .cocktail-header h2 { font-size: 1.1rem; margin-top: 0.3rem; }
    .cocktail-header h2 a { color: inherit; text-decoration: none; }
    .cocktail-header h2 a:hover { color: #e05e3a; }
    .cocktail-info { display: flex; gap: 0.5rem; align-items: center; margin-bottom: 0.25rem; }
    .status { font-size: 0.75rem; padding: 2px 8px; border-radius: 99px; font-weight: 600; }
    .status.done { background: #1a3a2a; color: #4ade80; }
    .status.todo { background: #3a1a2a; color: #f87171; }
    .cat { font-size: 0.75rem; color: #888; }
    .cocktail-body { display: grid; grid-template-columns: 300px 1fr; gap: 1rem; padding: 1rem 1.25rem; }
    @media (max-width: 768px) { .cocktail-body { grid-template-columns: 1fr; } }
    .drop-zone { aspect-ratio: 1; border: 2px dashed #333; border-radius: 8px; display: flex; flex-direction: column; align-items: center; justify-content: center; position: relative; overflow: hidden; cursor: pointer; transition: border-color 0.2s, background 0.2s; }
    .drop-zone:hover, .drop-zone.drag-over { border-color: #e05e3a; background: rgba(224,94,58,0.1); }
    .drop-zone img { width: 100%; height: 100%; object-fit: cover; position: absolute; inset: 0; }
    .drop-zone .drop-hint { position: absolute; bottom: 0; left: 0; right: 0; padding: 0.4rem; text-align: center; background: rgba(0,0,0,0.7); font-size: 0.75rem; color: #aaa; opacity: 0; transition: opacity 0.2s; }
    .drop-zone:hover .drop-hint { opacity: 1; }
    .drop-placeholder { text-align: center; color: #555; }
    .drop-placeholder svg { margin-bottom: 0.5rem; }
    .drop-placeholder p { font-size: 0.85rem; }
    .prompt-col { display: flex; flex-direction: column; gap: 0.5rem; }
    .prompt-text { width: 100%; height: 200px; background: #0f0f0f; border: 1px solid #222; border-radius: 8px; padding: 0.75rem; font-size: 0.8rem; color: #bbb; font-family: inherit; line-height: 1.5; resize: vertical; }
    .btn-row { display: flex; gap: 0.5rem; }
    .copy-btn { padding: 0.4rem 1rem; border: 1px solid #333; border-radius: 6px; background: #1a1a1a; color: #ccc; cursor: pointer; font-size: 0.85rem; transition: all 0.2s; }
    .copy-btn:hover { background: #e05e3a; border-color: #e05e3a; color: #fff; }
    .generate-btn { padding: 0.4rem 1rem; border: 1px solid #2a5a3a; border-radius: 6px; background: #1a3a2a; color: #4ade80; cursor: pointer; font-size: 0.85rem; transition: all 0.2s; }
    .generate-btn:hover { background: #2a5a3a; color: #fff; }
    .generate-btn:disabled { opacity: 0.5; cursor: wait; }
    .og-preview { margin-top: 0.5rem; position: relative; border-radius: 6px; overflow: hidden; border: 1px solid #222; }
    .og-preview img { width: 100%; display: block; }
    .og-preview.no-og img, .og-preview.no-og .regen-btn { display: none; }
    .og-preview.no-og .og-label { position: static; display: block; padding: 0.5rem; text-align: center; }
    .og-label { position: absolute; top: 4px; left: 4px; font-size: 0.65rem; background: rgba(0,0,0,0.7); color: #aaa; padding: 1px 6px; border-radius: 4px; z-index: 1; }
    .regen-btn { position: absolute; top: 4px; right: 4px; width: 28px; height: 28px; border-radius: 6px; border: 1px solid rgba(255,255,255,0.2); background: rgba(0,0,0,0.7); color: #ccc; font-size: 16px; cursor: pointer; z-index: 1; display: flex; align-items: center; justify-content: center; transition: all 0.2s; }
    .regen-btn:hover { background: #e05e3a; color: #fff; border-color: #e05e3a; }
    .regen-btn.spinning { animation: spin 0.8s linear infinite; }
    @keyframes spin { to { transform: rotate(360deg); } }
    .toast { position: fixed; bottom: 2rem; right: 2rem; background: #1a3a2a; color: #4ade80; padding: 0.75rem 1.25rem; border-radius: 8px; font-size: 0.9rem; transform: translateY(100px); opacity: 0; transition: all 0.3s; z-index: 100; }
    .toast.show { transform: translateY(0); opacity: 1; }
</style>
</head>
<body>
    <h1>Cocktail Image Manager</h1>
    <p class="subtitle">Model: ${IMAGE_MODEL} &middot; Copy prompts or generate directly, then drag &amp; drop images.</p>

    <div class="progress">
        <div class="progress-bar"><div class="progress-fill" style="width: ${Math.round(withImage / cocktails.length * 100)}%"></div></div>
        <span class="progress-text">${withImage} / ${cocktails.length} cocktails have images (${Math.round(withImage / cocktails.length * 100)}%)</span>
    </div>

    <div class="filters">
        <button class="active" onclick="filterCards('all', this)">All (${cocktails.length})</button>
        <button onclick="filterCards('needs', this)">Needs image (${cocktails.length - withImage})</button>
        <button onclick="filterCards('has', this)">Has image (${withImage})</button>
    </div>

    ${cards}

    <div class="toast" id="toast"></div>

<script>
function showToast(msg) {
    const t = document.getElementById('toast');
    t.textContent = msg;
    t.classList.add('show');
    setTimeout(() => t.classList.remove('show'), 2000);
}

function copyPrompt(slug) {
    const ta = document.querySelector('.prompt-text[data-slug="' + slug + '"]');
    if (ta) navigator.clipboard.writeText(ta.value).then(() => showToast('Prompt copied!'));
}

function filterCards(filter, btn) {
    document.querySelectorAll('.filters button').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    document.querySelectorAll('.cocktail').forEach(c => {
        if (filter === 'all') c.style.display = '';
        else if (filter === 'needs') c.style.display = c.classList.contains('needs-image') ? '' : 'none';
        else c.style.display = c.classList.contains('has-image') ? '' : 'none';
    });
}

async function regenerateOg(slug, btn) {
    btn.classList.add('spinning');
    try {
        const res = await fetch('/regenerate-og/' + slug, { method: 'POST' });
        const data = await res.json();
        if (data.ok) {
            showToast('OG image regenerated');
            const ogPreview = btn.closest('.og-preview');
            ogPreview.classList.remove('no-og');
            ogPreview.querySelector('img').src = '/og/' + slug + '.jpg?' + Date.now();
        } else showToast('Error: ' + data.error);
    } catch (err) { showToast('Failed: ' + err.message); }
    btn.classList.remove('spinning');
}

async function generateImage(slug, btn) {
    btn.disabled = true;
    btn.textContent = 'Generating...';
    try {
        const ta = document.querySelector('.prompt-text[data-slug="' + slug + '"]');
        const res = await fetch('/generate/' + slug, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ prompt: ta ? ta.value : '' }),
        });
        const data = await res.json();
        if (data.ok) {
            showToast('Image generated + saved');
            const card = btn.closest('.cocktail');
            const zone = card.querySelector('.drop-zone');
            zone.innerHTML = '<img src="/image/' + slug + '?' + Date.now() + '" alt="" /><p class="drop-hint">Drop new image to replace</p>';
            card.classList.remove('needs-image');
            card.classList.add('has-image');
            card.querySelector('.status').className = 'status done';
            card.querySelector('.status').textContent = 'Has image';
            const ogPreview = card.querySelector('.og-preview');
            if (ogPreview) { ogPreview.classList.remove('no-og'); ogPreview.querySelector('img').src = '/og/' + slug + '.jpg?' + Date.now(); }
        } else showToast('Error: ' + data.error);
    } catch (err) { showToast('Failed: ' + err.message); }
    btn.disabled = false;
    btn.textContent = 'Generate';
}

// Drag & drop + click to upload
document.querySelectorAll('.drop-zone').forEach(zone => {
    const slug = zone.dataset.slug;
    zone.addEventListener('dragover', e => { e.preventDefault(); zone.classList.add('drag-over'); });
    zone.addEventListener('dragleave', () => zone.classList.remove('drag-over'));
    zone.addEventListener('click', () => {
        const input = document.createElement('input');
        input.type = 'file'; input.accept = 'image/*';
        input.onchange = () => { if (input.files[0]) uploadFile(slug, input.files[0], zone); };
        input.click();
    });
    zone.addEventListener('drop', e => {
        e.preventDefault(); zone.classList.remove('drag-over');
        const file = e.dataTransfer.files[0];
        if (file && file.type.startsWith('image/')) uploadFile(slug, file, zone);
    });
});

async function uploadFile(slug, file, zone) {
    const formData = new FormData();
    formData.append('image', file);
    try {
        const res = await fetch('/upload/' + slug, { method: 'POST', body: formData });
        const data = await res.json();
        if (data.ok) {
            showToast('Image saved + OG generated');
            zone.innerHTML = '<img src="/image/' + slug + '?' + Date.now() + '" alt="" /><p class="drop-hint">Drop new image to replace</p>';
            const card = zone.closest('.cocktail');
            card.classList.remove('needs-image'); card.classList.add('has-image');
            card.querySelector('.status').className = 'status done';
            card.querySelector('.status').textContent = 'Has image';
            const ogPreview = card.querySelector('.og-preview');
            if (ogPreview) { ogPreview.classList.remove('no-og'); ogPreview.querySelector('img').src = '/og/' + slug + '.jpg?' + Date.now(); }
        } else showToast('Error: ' + data.error);
    } catch (err) { showToast('Upload failed: ' + err.message); }
}
</script>
</body>
</html>`;
}

// ============================================================
// HTTP Server
// ============================================================

const server = http.createServer(async (req, res) => {
    if (req.method === 'GET' && req.url === '/') {
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(renderHTML());
        return;
    }

    // Serve cocktail images
    if (req.method === 'GET' && req.url.startsWith('/image/')) {
        const slug = req.url.replace('/image/', '').split('?')[0];
        const imgPath = path.join(IMAGES_DIR, `${slug}.webp`);
        if (fs.existsSync(imgPath)) {
            res.writeHead(200, { 'Content-Type': 'image/webp', 'Cache-Control': 'no-cache' });
            res.end(fs.readFileSync(imgPath));
        } else {
            res.writeHead(404); res.end('Not found');
        }
        return;
    }

    // Serve OG images
    if (req.method === 'GET' && req.url.startsWith('/og/')) {
        const slug = req.url.replace('/og/', '').split('?')[0].replace(/\.jpg$/, '');
        const ogPath = path.join(OG_DIR, `${slug}.jpg`);
        if (fs.existsSync(ogPath)) {
            res.writeHead(200, { 'Content-Type': 'image/jpeg', 'Cache-Control': 'no-cache' });
            res.end(fs.readFileSync(ogPath));
        } else {
            res.writeHead(404); res.end('Not found');
        }
        return;
    }

    // Regenerate OG image
    if (req.method === 'POST' && req.url.startsWith('/regenerate-og/')) {
        const slug = req.url.replace('/regenerate-og/', '');
        try {
            const cocktails = loadCocktails();
            const cocktail = cocktails.find(c => c.slug === slug);
            if (!cocktail) throw new Error(`"${slug}" not found`);
            const imgPath = path.join(IMAGES_DIR, `${slug}.webp`);
            const imageBuffer = fs.existsSync(imgPath) ? fs.readFileSync(imgPath) : null;
            await generateAndSaveOg(cocktail, imageBuffer);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ ok: true }));
        } catch (err) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ ok: false, error: err.message }));
        }
        return;
    }

    // Generate image via OpenRouter
    if (req.method === 'POST' && req.url.startsWith('/generate/')) {
        const slug = req.url.replace('/generate/', '');
        const chunks = [];
        req.on('data', chunk => chunks.push(chunk));
        req.on('end', async () => {
            try {
                let body = {};
                if (chunks.length) body = JSON.parse(Buffer.concat(chunks).toString());

                const cocktails = loadCocktails();
                const cocktail = cocktails.find(c => c.slug === slug);
                if (!cocktail) throw new Error(`"${slug}" not found`);

                const prompt = body.prompt || buildPrompt(cocktail);
                console.log(`Generating: ${cocktail.name}`);

                const imageBuffer = await generateViaOpenRouter(prompt);
                const webpBuffer = await saveImage(slug, imageBuffer);
                await generateAndSaveOg(cocktail, webpBuffer);

                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ ok: true }));
            } catch (err) {
                console.error('Generate failed:', err.message);
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ ok: false, error: err.message }));
            }
        });
        return;
    }

    // Handle image upload
    if (req.method === 'POST' && req.url.startsWith('/upload/')) {
        const slug = req.url.replace('/upload/', '');
        const chunks = [];
        req.on('data', chunk => chunks.push(chunk));
        req.on('end', async () => {
            try {
                const body = Buffer.concat(chunks);
                const boundary = req.headers['content-type'].split('boundary=')[1];
                const parts = parseMultipart(body, boundary);
                const imagePart = parts.find(p => p.name === 'image');
                if (!imagePart) throw new Error('No image in upload');

                const cocktails = loadCocktails();
                const cocktail = cocktails.find(c => c.slug === slug);
                if (!cocktail) throw new Error(`"${slug}" not found`);

                const webpBuffer = await saveImage(slug, imagePart.data);
                await generateAndSaveOg(cocktail, webpBuffer);

                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ ok: true }));
            } catch (err) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ ok: false, error: err.message }));
            }
        });
        return;
    }

    res.writeHead(404); res.end('Not found');
});

// Simple multipart parser
function parseMultipart(body, boundary) {
    const parts = [];
    const boundaryBuf = Buffer.from('--' + boundary);
    const positions = [];
    let pos = 0;
    while (pos < body.length) {
        const idx = body.indexOf(boundaryBuf, pos);
        if (idx === -1) break;
        positions.push(idx);
        pos = idx + boundaryBuf.length;
    }
    for (let i = 0; i < positions.length - 1; i++) {
        const partStart = positions[i] + boundaryBuf.length + 2;
        const partEnd = positions[i + 1] - 2;
        const partData = body.subarray(partStart, partEnd);
        const headerEnd = partData.indexOf('\r\n\r\n');
        if (headerEnd === -1) continue;
        const headers = partData.subarray(0, headerEnd).toString();
        const data = partData.subarray(headerEnd + 4);
        const nameMatch = headers.match(/name="([^"]+)"/);
        const filenameMatch = headers.match(/filename="([^"]+)"/);
        parts.push({ name: nameMatch?.[1] || '', filename: filenameMatch?.[1] || '', data });
    }
    return parts;
}

server.listen(PORT, '127.0.0.1', () => {
    console.log(`\n  Cocktail Image Manager running at http://localhost:${PORT}\n`);
    console.log(`  Model: ${IMAGE_MODEL}`);
    console.log(`  OpenRouter: ${OPENROUTER_API_KEY ? 'configured' : 'NOT SET (generate button will fail)'}\n`);
});
