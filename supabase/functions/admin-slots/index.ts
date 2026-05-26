import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const TZ = 'Asia/Jerusalem'

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  })
}

function fmtDate(iso: string) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' })
    .format(new Date(iso))
}

function fmtTime(iso: string) {
  return new Intl.DateTimeFormat('en-GB', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hour12: false })
    .format(new Date(iso))
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  try {
    const body = await req.json()
    const { action, adminToken } = body

    const expectedToken = Deno.env.get('ADMIN_TOKEN')
    if (!adminToken || !expectedToken || adminToken !== expectedToken) {
      return json({ success: false, error: 'unauthorized' }, 403)
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    // ── getSlots ──────────────────────────────────────────────────
    if (action === 'getSlots') {
      const { dateFrom, dateTo } = body
      if (!dateFrom || !dateTo) return json({ success: false, error: 'missing_params' }, 400)

      // Use UTC bounds that fully cover the Jerusalem day regardless of DST.
      // Jerusalem is UTC+2 (winter) or UTC+3 (summer).
      // Lower bound: start of dateFrom in Jerusalem summer (+03) — earliest UTC possible.
      // Upper bound: end of dateTo in Jerusalem winter (+02) — latest UTC possible.
      const fromUtc = new Date(`${dateFrom}T00:00:00+03:00`).toISOString()
      const toUtc   = new Date(`${dateTo}T23:59:59+02:00`).toISOString()

      const { data, error } = await supabase
        .from('slots')
        .select('id, start_time, end_time, status')
        .gte('start_time', fromUtc)
        .lte('start_time', toUtc)
        .order('start_time')

      if (error) throw error

      const slots = (data ?? []).map(row => ({
        id:     row.id,
        date:   fmtDate(row.start_time),
        time:   fmtTime(row.start_time),
        status: row.status,
      }))

      return json({ success: true, slots })
    }

    // ── toggleSlot ───────────────────────────────────────────────
    if (action === 'toggleSlot') {
      const slotId = Number(body.slotId)
      if (!slotId) return json({ success: false, error: 'missing_params' }, 400)

      const { data: rows, error: selErr } = await supabase
        .from('slots')
        .select('id, status')
        .eq('id', slotId)
        .single()

      if (selErr || !rows) return json({ success: false, error: 'slot_not_found' }, 404)

      const current = rows.status
      const newStatus =
        current === 'available' ? 'locked' :
        current === 'locked'    ? 'available' :
        null

      if (!newStatus) return json({ success: false, error: 'cannot_toggle', status: current }, 409)

      const { error: updErr } = await supabase
        .from('slots')
        .update({ status: newStatus, last_updated: new Date().toISOString() })
        .eq('id', slotId)

      if (updErr) throw updErr

      return json({ success: true, slotId, prevStatus: current, newStatus })
    }

    // ── deleteSlot ───────────────────────────────────────────────
    if (action === 'deleteSlot') {
      const slotId = Number(body.slotId)
      if (!slotId) return json({ success: false, error: 'missing_params' }, 400)

      const { data: rows, error: selErr } = await supabase
        .from('slots')
        .select('id, status')
        .eq('id', slotId)
        .single()

      if (selErr || !rows) return json({ success: false, error: 'slot_not_found' }, 404)

      if (rows.status === 'booked' || rows.status === 'pending') {
        return json({ success: false, error: 'cannot_delete_active', status: rows.status }, 409)
      }

      const { error: delErr } = await supabase
        .from('slots')
        .delete()
        .eq('id', slotId)

      if (delErr) return json({ success: false, error: 'delete_blocked_by_fk' }, 409)

      return json({ success: true, slotId })
    }

    // ── addSlot ──────────────────────────────────────────────────
    if (action === 'addSlot') {
      const { date, time } = body
      if (!date || !time || !/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(time)) {
        return json({ success: false, error: 'invalid_params' }, 400)
      }

      // Convert Jerusalem local time to UTC
      const startUtc = new Date(`${date}T${time}:00+03:00`).toISOString()
      const endUtc   = new Date(new Date(startUtc).getTime() + 120 * 60 * 1000).toISOString()

      // Check for existing slot (idempotent)
      const { data: existing } = await supabase
        .from('slots')
        .select('id, status')
        .eq('start_time', startUtc)
        .maybeSingle()

      if (existing) {
        return json({ success: true, already_exists: true,
          slot: { id: existing.id, date, time, status: existing.status } })
      }

      const { data: inserted, error: insErr } = await supabase
        .from('slots')
        .insert({ start_time: startUtc, end_time: endUtc, status: 'available',
                  last_updated: new Date().toISOString() })
        .select('id')
        .single()

      if (insErr || !inserted) return json({ success: false, error: 'insert_failed' }, 500)

      return json({ success: true, slot: { id: inserted.id, date, time, status: 'available' } })
    }

    return json({ success: false, error: 'unknown_action' }, 400)
  } catch (err) {
    console.error('[admin-slots]', err)
    return json({ success: false, error: 'internal_error' }, 500)
  }
})
