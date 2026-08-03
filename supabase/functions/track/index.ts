// ================================================================
// track — PUBLIC analytics ingest.
//
// Why this exists: the site already reports to Mixpanel and GA4, but
// neither can be read without an API key the project does not hold,
// and any ad blocker drops both silently. This endpoint writes a copy
// we own into site_events, so "how many people visited, opened the
// chat, and actually talked to it" is answerable with plain SQL at
// any time, by anyone with database access.
//
// Deliberately never stores PII. session_id is a random per-tab id
// generated in the browser; a payload carrying anything phone-shaped
// is dropped rather than cleaned, so a frontend mistake fails loudly
// in the logs instead of quietly persisting a customer's number.
// ================================================================
import { createClient } from 'npm:@supabase/supabase-js@2'

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, Authorization',
}

// Only events the frontend is known to emit. An unknown name is almost always
// a typo or someone probing the endpoint — either way it is not data.
const ALLOWED = new Set([
  // page / funnel
  'page_view', 'landing_page_viewed', 'scroll_depth',
  'whatsapp_clicked', 'booking_clicked',
  // navigation
  'nav_section_clicked', 'mobile_menu_opened', 'mobile_menu_closed',
  'hero_cta_clicked', 'book_now_clicked',
  // services & gallery
  'service_book_clicked', 'gallery_photo_opened', 'gallery_load_more_clicked',
  'gallery_cta_clicked', 'lightbox_wa_clicked', 'lightbox_closed', 'lightbox_navigated',
  // content engagement
  'faq_item_opened', 'process_section_viewed', 'testimonials_section_viewed',
  'reel_muted', 'reel_unmuted',
  // contact
  'contact_whatsapp_clicked', 'contact_phone_clicked', 'contact_email_clicked',
  'social_clicked',
  // chat
  'chat_opened', 'chat_closed', 'chat_message_sent', 'chat_reply_received',
  'chat_escalated_to_wa',
])

// Israeli mobile numbers, E.164, and long digit runs. Cheap guard, not a
// scrubber — see the header note.
const PII_RE = /(\+?972|0)5\d[- ]?\d{3}[- ]?\d{4}|\d{9,}/

const str = (v: unknown, max: number): string | null => {
  if (typeof v !== 'string') return null
  const s = v.trim()
  return s ? s.slice(0, max) : null
}

function noContent(status = 204) {
  return new Response(null, { status, headers: CORS })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST')    return noContent(405)

  try {
    // sendBeacon posts text/plain, so parse the body as text and JSON it
    // ourselves rather than trusting the content type.
    const raw = await req.text()
    if (!raw || raw.length > 4000) return noContent(400)

    let body: Record<string, unknown>
    try { body = JSON.parse(raw) } catch { return noContent(400) }

    const event     = str(body.event, 64)
    const sessionId = str(body.session_id, 64)
    if (!event || !sessionId)   return noContent(400)
    if (!ALLOWED.has(event))    { console.warn('[track] rejected event:', event); return noContent(400) }

    if (PII_RE.test(raw)) {
      console.error('[track] payload looked like PII — dropped. event:', event)
      return noContent(400)
    }

    const device = body.device === 'mobile' ? 'mobile'
                 : body.device === 'tablet' ? 'tablet'
                 : 'desktop'

    // Keep only the origin+path of the referrer. The query string is where
    // tracking junk and the occasional accidental identifier live.
    let referrer = str(body.referrer, 300)
    if (referrer && referrer !== 'direct') {
      try { const u = new URL(referrer); referrer = u.origin + u.pathname } catch { /* keep raw */ }
    }

    const props = (body.props && typeof body.props === 'object' && !Array.isArray(body.props))
      ? body.props as Record<string, unknown>
      : {}

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    const { error } = await supabase.from('site_events').insert({
      event,
      session_id: sessionId,
      page:     str(body.page, 200),
      referrer,
      device,
      props,
    })
    if (error) { console.error('[track] insert failed', error); return noContent(500) }

    return noContent()
  } catch (err) {
    console.error('[track]', err)
    return noContent(500)
  }
})
