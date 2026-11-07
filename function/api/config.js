export async function onRequest(context) {
    const { env } = context;

    // Baca pemboleh ubah persekitaran daripada Cloudflare Pages (context.env)
    const config = {
        SUPABASE_URL: env.SUPABASE_URL || '',
        SUPABASE_KEY: env.SUPABASE_ANON_KEY || env.SUPABASE_KEY || '',
        GAS_URL: env.GAS_URL || ''
    };

    // Kembalikan sebagai respons JSON dengan pengepala keselamatan cache
    return new Response(JSON.stringify(config), {
        status: 200,
        headers: {
            'Content-Type': 'application/json',
            'Cache-Control': 'no-store, no-cache, must-revalidate',
            'X-Content-Type-Options': 'nosniff'
        }
    });
}