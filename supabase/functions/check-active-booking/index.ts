import { createClient } from 'npm:@supabase/supabase-js@2'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, Authorization',
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  })
}

function normalizePhone(raw: string): string | null {
  const digits = (raw ?? '').replace(/\D/g, '')
  if (digits.startsWith('972') && digits.length === 12) return '+' + digits
  if (digits.startsWith('05')  && digits.length === 10)  return '+972' + digits.slice(1)
  return null
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  try {
    const { phone: rawPhone } = await req.json()
    const phone = normalizePhone(rawPhone ?? '')
    if (!phone) return json({ active: false })

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    const { data, error } = await supabase
      .from('bookings_view')
      .select('date, time')
      .eq('phone', phone)
      .in('status', ['Pending', 'Approved'])
      .order('timestamp', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (error) {
      console.error('[check-active-booking] query error:', error.message)
      return json({ active: false })
    }

    if (!data) return json({ active: false })

    console.log('[check-active-booking] active booking found for ****' + phone.slice(-4))
    return json({ active: true, date: data.date, time: data.time })

  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[check-active-booking] unhandled:', msg)
    return json({ active: false })
  }
})
