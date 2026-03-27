import { generateHomepageOgImage } from '../../utils/og-image';

export async function GET() {
    const jpg = await generateHomepageOgImage();

    return new Response(jpg, {
        headers: {
            'Content-Type': 'image/jpeg',
            'Cache-Control': 'public, max-age=31536000, immutable',
        },
    });
}
