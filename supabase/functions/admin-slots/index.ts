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

    const body        = await req.json()
    const { action }  = body

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    // Helper: fire-and-forget audit insert (never fails the primary action).
    // deno-lint-ignore no-explicit-any
    function auditSlot(fields: Record<string, any>) {
      supabase.from('audit_log').insert({
        ...fields,
        ip:         req.headers.get('x-forwarded-for') ?? 'unknown',
        user_agent: (req.headers.get('user-agent') ?? '').slice(0, 200),
      }).then(() => {/* intentional no-op */}).catch((e: Error) =>
        console.error('[admin-slots] audit-insert failed', e.message)
      )
    }

    // ── getSlots ──────────────────────────────────────────────────
    if (action === 'getSlots') {
      const { dateFrom, dateTo } = body
      if (!dateFrom || !dateTo) return json({ success: false, error: 'missing_params' }, 400)

      const fromUtc = new Date(`${dateFrom}T00:00:00+03:00`).toISOString()
      const toUtc   = new Date(`${dateTo}T23:59:59+02:00`).toISOString()

      const { data, error } = await supabase
        .from('slots')
        .select('id, start_time, end_time, status')
        .gte('start_time', fromUtc)
        .lte('start_time', toUtc)
        .order('start_time')

      if (error) throw error

      const slots = (data ?? []).map((row: { id: number; start_time: string; end_time: string; status: string }) => ({
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

      auditSlot({ action: 'toggle_slot', slot_id: slotId, prev_val: current, new_val: newStatus })

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

      const { error: delErr } = await supabase.from('slots').delete().eq('id', slotId)

      if (delErr) return json({ success: false, error: 'delete_blocked_by_fk' }, 409)

      auditSlot({ action: 'delete_slot', slot_id: slotId, prev_val: rows.status })

      return json({ success: true, slotId })
    }

    // ── addSlot ──────────────────────────────────────────────────
    if (action === 'addSlot') {
      const { date, time } = body
      if (!date || !time || !/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(time)) {
        return json({ success: false, error: 'invalid_params' }, 400)
      }

      const startUtc = new Date(`${date}T${time}:00+03:00`).toISOString()
      const endUtc   = new Date(new Date(startUtc).getTime() + 120 * 60 * 1000).toISOString()

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

      auditSlot({ action: 'add_slot', slot_id: inserted.id, new_val: `${date} ${time}` })

      return json({ success: true, slot: { id: inserted.id, date, time, status: 'available' } })
    }

    return json({ success: false, error: 'unknown_action' }, 400)
  } catch (err) {
    console.error('[admin-slots]', err)
    return json({ success: false, error: 'internal_error' }, 500)
  }
})
