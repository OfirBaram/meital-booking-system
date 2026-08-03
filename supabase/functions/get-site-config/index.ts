// ================================================================
// get-site-config — PUBLIC endpoint.
// Returns the live service catalog (active only, sorted) and the
// flat site_config key→value map. Consumed by the booking page
// (index.html) and the landing page on load to render services
// and apply the theme (CSS variables) + editable texts.
//
// No auth: this is non-sensitive presentation data. A short cache
// keeps the page fast while staying fresh after an admin edit.
// ================================================================
import { createClient } from 'npm:@supabase/supabase-js@2'

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, Authorization',
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...CORS,
      'Content-Type':  'application/json',
      // Short edge/browser cache — admin edits surface within ~30s.
      'Cache-Control': 'public, max-age=30',
      'X-Content-Type-Options': 'nosniff',
    },
  })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  try {
    // 2026-08-03: this function had been sitting on deployment v30 since well
    // before the project's API keys were rotated, and its stale secret snapshot
    // made PostgREST reject every query with PGRST303 'JWT issued at future' —
    // a 500 on every page load. Freshly deployed functions (get-slots et al.)
    // were unaffected. Redeploying is what fixes it; keep this function in the
    // regular deploy sweep so it never drifts this far behind again.
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    const [{ data: services, error: svcErr }, { data: cfgRows, error: cfgErr }] = await Promise.all([
      supabase
        .from('services')
        .select('id, name_he, desc_he, duration_min, icon, image_url, color_hex, sort_order')
        .eq('active', true)
        .order('sort_order', { ascending: true }),
      supabase
        .from('site_config')
        .select('key, value'),
    ])

    if (svcErr) throw svcErr
    if (cfgErr) throw cfgErr

    const config: Record<string, string> = {}
    for (const row of cfgRows ?? []) config[row.key as string] = row.value as string

    return json({ success: true, services: services ?? [], config })
  } catch (err) {
    console.error('[get-site-config]', err)
    return json({ success: false, error: 'internal_error' }, 500)
  }
})
