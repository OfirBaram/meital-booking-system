import { createClient }           from 'npm:@supabase/supabase-js@2'
import { validateAdminSession }   from '../_shared/auth.ts'
import { adminCors, SEC_HEADERS } from '../_shared/cors.ts'

const TZ = 'Asia/Jerusalem'

function fmtDate(iso: string) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' })
    .format(new Date(iso))
}

function fmtTime(iso: string) {
  return new Intl.DateTimeFormat('en-GB', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hour12: false })
    .format(new Date(iso))
}

function normalizePhone(raw: string): string {
  let p = raw.replace(/\D/g, '')
  if (p.startsWith('972'))      p = '+' + p
  else if (p.startsWith('0'))   p = '+972' + p.slice(1)
  else if (!p.startsWith('+'))  p = '+972' + p
  return p
}

Deno.serve(async (req) => {
  const cors = adminCors(req)

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: { ...cors, ...SEC_HEADERS } })
  }

  function json(body: unknown, status = 200) {
    return new Response(JSON.stringify(body), {
      status,
      headers: { ...cors, ...SEC_HEADERS, 'Content-Type': 'application/json' },
    })
  }

  try {
    const secret = (Deno.env.get('HMAC_SECRET') ?? '').trim()
    if (!await validateAdminSession(req, secret)) {
      return json({ success: false, error: 'unauthorized' }, 403)
    }

    const body           = await req.json()
    const { action }     = body

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    // ── getClients ────────────────────────────────────────────────
    if (action === 'getClients') {
      const search = String(body.search || '').trim()
      let query = supabase
        .from('clients')
        .select('id, phone, full_name, created_at')
        .order('created_at', { ascending: false })
        .limit(50)

      if (search.length >= 2) {
        query = query.or(`full_name.ilike.%${search}%,phone.ilike.%${search}%`)
      }

      const { data, error } = await query
      if (error) throw error

      return json({ success: true, clients: data ?? [] })
    }

    // ── getClientHistory ──────────────────────────────────────────
    if (action === 'getClientHistory') {
      const phone = normalizePhone(String(body.clientPhone || '').trim())
      if (!phone) return json({ success: false, error: 'invalid_phone' }, 400)

      const { data: clientRows, error: cErr } = await supabase
        .from('clients')
        .select('id, phone, full_name, created_at')
        .eq('phone', phone)
        .maybeSingle()

      if (cErr) throw cErr
      if (!clientRows) return json({ success: false, error: 'client_not_found' }, 404)

      const { data: appts, error: aErr } = await supabase
        .from('appointments')
        .select('id, treatment_name, status, admin_token, calendar_event_id, created_at, slot_id, duration_min')
        .eq('client_id', clientRows.id)
        .order('created_at', { ascending: false })

      if (aErr) throw aErr

      const slotIds = [...new Set((appts ?? []).map((a: { slot_id: string }) => a.slot_id).filter(Boolean))]
      const slotsMap: Record<string, { start_time: string }> = {}

      if (slotIds.length > 0) {
        const { data: slotRows } = await supabase
          .from('slots')
          .select('id, start_time')
          .in('id', slotIds)
        ;(slotRows ?? []).forEach((s: { id: string; start_time: string }) => { slotsMap[s.id] = s })
      }

      // deno-lint-ignore no-explicit-any
      const appointments = (appts ?? []).map((a: any) => {
        const slot = slotsMap[a.slot_id]
        return {
          id:                a.id,
          treatment_name:    a.treatment_name,
          status:            a.status,
          admin_token:       a.admin_token,
          calendar_event_id: a.calendar_event_id ?? null,
          date:              slot ? fmtDate(slot.start_time) : null,
          time:              slot ? fmtTime(slot.start_time) : null,
          duration_min:      a.duration_min,
        }
      })

      return json({ success: true, client: clientRows, appointments })
    }

    return json({ success: false, error: 'unknown_action' }, 400)
  } catch (err) {
    console.error('[admin-clients]', err)
    return json({ success: false, error: 'internal_error' }, 500)
  }
})
