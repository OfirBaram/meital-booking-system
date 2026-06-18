// ================================================================
// admin-site-config — ADMIN-ONLY CRUD for the service catalog and
// site configuration (colors + texts). Requires a valid admin
// session. Every mutation is written to audit_log (fire-and-forget).
//
// Actions:
//   listServices                                  → all services (incl. inactive)
//   upsertService { service }                     → insert/update; keeps ≥1 active
//   deleteService { id }                          → delete; blocks last active
//   reorderServices { ids: [...] }                → set sort_order by position
//   updateConfig { updates: {key: value, ...} }   → bulk config update (validated)
//   resetConfigKey { key }                        → reset one key to default_value
//   resetColors                                   → reset all colors to defaults
// ================================================================
import { createClient }           from 'npm:@supabase/supabase-js@2'
import { validateAdminSession }   from '../_shared/auth.ts'
import { adminCors, SEC_HEADERS } from '../_shared/cors.ts'

const HEX_RE   = /^#[0-9A-Fa-f]{6}$/
const ID_RE    = /^[a-z0-9_]{2,40}$/
const MAX_TEXT = 200

function isValidUrl(s: string): boolean {
  if (!s) return true            // empty allowed (optional field)
  try { const u = new URL(s); return u.protocol === 'http:' || u.protocol === 'https:' }
  catch { return false }
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

  function audit(supabase: ReturnType<typeof createClient>, action: string, prev: string, next: string) {
    ;(async () => {
      try {
        await supabase.from('audit_log').insert({
          action,
          prev_val:   prev.slice(0, 500),
          new_val:    next.slice(0, 500),
          ip:         req.headers.get('x-forwarded-for') ?? 'unknown',
          user_agent: (req.headers.get('user-agent') ?? '').slice(0, 200),
        })
      } catch (e) { console.error('[admin-site-config] audit-insert failed', e) }
    })()
  }

  try {
    const secret = (Deno.env.get('HMAC_SECRET') ?? '').trim()
    if (!await validateAdminSession(req, secret)) {
      return json({ success: false, error: 'unauthorized' }, 403)
    }

    const body       = await req.json()
    const { action } = body

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    // ── listServices ───────────────────────────────────────────
    if (action === 'listServices') {
      const { data, error } = await supabase
        .from('services')
        .select('id, name_he, desc_he, duration_min, icon, image_url, color_hex, sort_order, active')
        .order('sort_order', { ascending: true })
      if (error) throw error
      return json({ success: true, services: data ?? [] })
    }

    // ── listConfig ─────────────────────────────────────────────
    if (action === 'listConfig') {
      const { data, error } = await supabase
        .from('site_config')
        .select('key, value, category, label_he, default_value, sort_order')
        .order('category', { ascending: true })
        .order('sort_order', { ascending: true })
      if (error) throw error
      return json({ success: true, config: data ?? [] })
    }

    // ── upsertService ──────────────────────────────────────────
    if (action === 'upsertService') {
      const svc = body.service ?? {}
      const name = String(svc.name_he ?? '').trim()
      if (!name || name.length > 60) {
        return json({ success: false, error: 'שם השירות חובה (עד 60 תווים)' }, 400)
      }
      const duration = parseInt(svc.duration_min, 10)
      if (!Number.isFinite(duration) || duration < 5 || duration > 360) {
        return json({ success: false, error: 'משך חייב להיות בין 5 ל-360 דקות' }, 400)
      }
      const desc = String(svc.desc_he ?? '').slice(0, MAX_TEXT)
      const icon = String(svc.icon ?? '💅').slice(0, 8) || '💅'
      const imageUrl = svc.image_url ? String(svc.image_url).trim() : null
      if (imageUrl && !isValidUrl(imageUrl)) {
        return json({ success: false, error: 'כתובת תמונה לא תקינה' }, 400)
      }
      const colorHex = svc.color_hex ? String(svc.color_hex).trim() : null
      if (colorHex && !HEX_RE.test(colorHex)) {
        return json({ success: false, error: 'צבע לא תקין (#RRGGBB)' }, 400)
      }
      const active = svc.active !== false   // default true

      // Resolve id: existing (edit) or generate (new).
      let id = String(svc.id ?? '').trim()
      const isNew = !id
      if (isNew) {
        id = 'svc_' + Date.now().toString(36) + Math.floor(Math.random() * 1296).toString(36)
      } else if (!ID_RE.test(id)) {
        // Library ids are clean; reject anything unexpected for a new-style id.
        return json({ success: false, error: 'מזהה שירות לא תקין' }, 400)
      }

      // If editing an existing active service to inactive, ensure ≥1 stays active.
      if (!active && !isNew) {
        const { count } = await supabase
          .from('services').select('id', { count: 'exact', head: true })
          .eq('active', true).neq('id', id)
        if ((count ?? 0) < 1) {
          return json({ success: false, error: 'חייב להיות שירות פעיל אחד לפחות' }, 400)
        }
      }

      // sort_order: keep provided, or append at the end for new services.
      let sortOrder = parseInt(svc.sort_order, 10)
      if (!Number.isFinite(sortOrder)) {
        const { data: maxRow } = await supabase
          .from('services').select('sort_order').order('sort_order', { ascending: false }).limit(1).maybeSingle()
        sortOrder = ((maxRow?.sort_order as number) ?? -1) + 1
      }

      const record = {
        id, name_he: name, desc_he: desc, duration_min: duration,
        icon, image_url: imageUrl, color_hex: colorHex,
        sort_order: sortOrder, active, updated_at: new Date().toISOString(),
      }

      const { error } = await supabase.from('services').upsert(record, { onConflict: 'id' })
      if (error) throw error

      audit(supabase, isNew ? 'service_create' : 'service_update', '', id + '=' + name)
      return json({ success: true, service: record })
    }

    // ── deleteService ──────────────────────────────────────────
    if (action === 'deleteService') {
      const id = String(body.id ?? '').trim()
      if (!id) return json({ success: false, error: 'id required' }, 400)

      // Block deleting the last active service.
      const { data: target } = await supabase
        .from('services').select('active, name_he').eq('id', id).maybeSingle()
      if (target?.active) {
        const { count } = await supabase
          .from('services').select('id', { count: 'exact', head: true })
          .eq('active', true).neq('id', id)
        if ((count ?? 0) < 1) {
          return json({ success: false, error: 'לא ניתן למחוק את השירות הפעיל היחיד' }, 400)
        }
      }

      const { error } = await supabase.from('services').delete().eq('id', id)
      if (error) throw error

      audit(supabase, 'service_delete', id + '=' + (target?.name_he ?? ''), '')
      return json({ success: true })
    }

    // ── reorderServices ────────────────────────────────────────
    if (action === 'reorderServices') {
      const ids = Array.isArray(body.ids) ? body.ids.map(String) : []
      if (!ids.length) return json({ success: false, error: 'ids required' }, 400)

      // Update each sort_order to its array index.
      for (let i = 0; i < ids.length; i++) {
        const { error } = await supabase
          .from('services')
          .update({ sort_order: i, updated_at: new Date().toISOString() })
          .eq('id', ids[i])
        if (error) throw error
      }
      audit(supabase, 'service_reorder', '', ids.join(','))
      return json({ success: true })
    }

    // ── updateConfig ───────────────────────────────────────────
    if (action === 'updateConfig') {
      const updates = body.updates ?? {}
      if (typeof updates !== 'object' || Array.isArray(updates)) {
        return json({ success: false, error: 'updates object required' }, 400)
      }
      const keys = Object.keys(updates)
      if (!keys.length) return json({ success: false, error: 'no updates' }, 400)

      // Load the categories of the keys being updated so we can validate
      // color keys as hex.
      const { data: existing } = await supabase
        .from('site_config').select('key, category').in('key', keys)
      const catMap: Record<string, string> = {}
      for (const r of existing ?? []) catMap[r.key as string] = r.category as string

      const updated: string[] = []
      for (const key of keys) {
        if (!(key in catMap)) {
          return json({ success: false, error: 'מפתח לא קיים: ' + key }, 400)
        }
        let value = String(updates[key] ?? '')
        if (catMap[key] === 'colors') {
          if (!HEX_RE.test(value)) {
            return json({ success: false, error: 'צבע לא תקין עבור ' + key }, 400)
          }
        } else {
          value = value.slice(0, MAX_TEXT)
        }
        const { error } = await supabase
          .from('site_config')
          .update({ value, updated_at: new Date().toISOString() })
          .eq('key', key)
        if (error) throw error
        updated.push(key)
      }
      audit(supabase, 'config_update', '', updated.join(','))
      return json({ success: true, updated_keys: updated })
    }

    // ── resetConfigKey ─────────────────────────────────────────
    if (action === 'resetConfigKey') {
      const key = String(body.key ?? '').trim()
      if (!key) return json({ success: false, error: 'key required' }, 400)
      const { data: row } = await supabase
        .from('site_config').select('default_value').eq('key', key).maybeSingle()
      if (!row) return json({ success: false, error: 'מפתח לא קיים' }, 400)
      const { error } = await supabase
        .from('site_config')
        .update({ value: row.default_value, updated_at: new Date().toISOString() })
        .eq('key', key)
      if (error) throw error
      audit(supabase, 'config_reset', key, String(row.default_value))
      return json({ success: true, key, value: row.default_value })
    }

    // ── resetColors ────────────────────────────────────────────
    if (action === 'resetColors') {
      const { data: rows } = await supabase
        .from('site_config').select('key, default_value').eq('category', 'colors')
      for (const r of rows ?? []) {
        await supabase.from('site_config')
          .update({ value: r.default_value, updated_at: new Date().toISOString() })
          .eq('key', r.key)
      }
      audit(supabase, 'config_reset_colors', '', String((rows ?? []).length))
      return json({ success: true })
    }

    return json({ success: false, error: 'unknown_action' }, 400)

  } catch (err) {
    console.error('[admin-site-config]', err)
    return json({ success: false, error: 'internal_error' }, 500)
  }
})
