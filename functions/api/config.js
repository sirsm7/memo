export async function onRequestGet(context) {
  const env = (context && context.env) || {};
  const supabaseUrl = String(env.SUPABASE_URL || '').trim();
  const supabaseAnonKey = String(env.SUPABASE_ANON_KEY || env.SUPABASE_KEY || '').trim();
  const supabaseSchema = String(env.SUPABASE_SCHEMA || 'memo_ag').trim() || 'memo_ag';
  const gasEndpointUrl = String(env.GAS_ENDPOINT_URL || env.GAS_URL || '').trim();

  const headers = {
    'Content-Type': 'application/json',
    'Cache-Control': 'no-store, no-cache, must-revalidate',
    'X-Content-Type-Options': 'nosniff'
  };

  if (!supabaseUrl || !supabaseAnonKey) {
    return new Response(
      JSON.stringify({
        error: 'Server configuration error: Missing required SUPABASE_URL or SUPABASE_ANON_KEY.'
      }),
      {
        status: 500,
        headers
      }
    );
  }

  const payload = {
    SUPABASE_URL: supabaseUrl,
    SUPABASE_ANON_KEY: supabaseAnonKey,
    SUPABASE_KEY: supabaseAnonKey,
    SUPABASE_SCHEMA: supabaseSchema,
    GAS_ENDPOINT_URL: gasEndpointUrl,
    GAS_URL: gasEndpointUrl
  };

  return new Response(JSON.stringify(payload), {
    status: 200,
    headers
  });
}

export const onRequest = onRequestGet;