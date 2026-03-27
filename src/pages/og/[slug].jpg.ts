import type { APIContext, GetStaticPaths } from 'astro';
import type { Cocktail } from '../../types';
import cocktails from '../../../cocktails.json';
import { generateOgImage } from '../../utils/og-image';

export const getStaticPaths: GetStaticPaths = () => {
    return (cocktails as Cocktail[]).map(cocktail => ({
        params: { slug: cocktail.slug },
        props: { cocktail },
    }));
};

export async function GET({ props }: APIContext) {
    const cocktail = props.cocktail as Cocktail;
    const jpg = await generateOgImage(cocktail.name, cocktail.category, cocktail.glass, cocktail.slug);

    return new Response(jpg, {
        headers: {
            'Content-Type': 'image/jpeg',
            'Cache-Control': 'public, max-age=31536000, immutable',
        },
    });
}
