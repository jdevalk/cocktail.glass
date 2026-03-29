import { validSlugs } from '../_shared/slugs.js';
import { validateTurnstile } from '../_shared/turnstile.js';

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

export async function onRequestPost({ request, env }) {
  const ip = request.headers.get('CF-Connecting-IP') || 'unknown';

  let formData;
  try {
    formData = await request.formData();
  } catch {
    return jsonResponse(400, { error: 'Invalid form data.' });
  }

  const slug = formData.get('slug');
  const token = formData.get('turnstile_token');
  const attribution = formData.get('attribution') || '';
  const file = formData.get('image');

  if (!slug || !validSlugs.has(slug)) {
    return jsonResponse(400, { error: 'Invalid cocktail.' });
  }

  if (!token) {
    return jsonResponse(400, { error: 'Missing verification token.' });
  }

  const turnstileValid = await validateTurnstile(token, env.TURNSTILE_SECRET_KEY, ip);
  if (!turnstileValid) {
    return jsonResponse(403, { error: 'Verification failed. Please try again.' });
  }

  if (!file || !(file instanceof File)) {
    return jsonResponse(400, { error: 'No image provided.' });
  }

  if (!ALLOWED_TYPES.includes(file.type)) {
    return jsonResponse(400, { error: 'Only JPEG, PNG, and WebP images are accepted.' });
  }

  if (file.size > MAX_FILE_SIZE) {
    return jsonResponse(400, { error: 'Image must be under 5MB.' });
  }

  const timestamp = Date.now();
  const random = Math.random().toString(36).slice(2, 8);
  const ext = file.type === 'image/png' ? 'png' : file.type === 'image/webp' ? 'webp' : 'jpg';
  const key = `pending/${slug}/${timestamp}-${random}.${ext}`;

  const arrayBuffer = await file.arrayBuffer();

  await env.PHOTOS.put(key, arrayBuffer, {
    httpMetadata: { contentType: file.type },
    customMetadata: {
      slug,
      attribution: attribution.slice(0, 100),
      ip: hashIP(ip),
      uploadedAt: new Date().toISOString(),
    },
  });

  return jsonResponse(201, {
    success: true,
    message: 'Thanks! Your photo will be reviewed shortly.',
  });
}

function jsonResponse(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': 'https://cocktail.glass',
    },
  });
}

async function hashIP(ip) {
  const encoder = new TextEncoder();
  const data = encoder.encode(ip + '-cocktail-photos');
  const hash = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('').slice(0, 16);
}
