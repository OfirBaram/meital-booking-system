// admin-action — one-tap approve/reject from the admin SMS link.
//
// The link in the admin notification SMS is a browser GET (no anon JWT), so this
// function runs with verify_jwt = false (see config.toml). Security is enforced by
// the per-booking HMAC token: token = HMAC-SHA256(HMAC_SECRET, bookingId), the same
// value verify-and-book signs. Without the secret the link can't be forged.
//
// GET is SAFE — it NEVER mutates; it only renders a Hebrew confirm page with a button.
// The approve/reject happens on the POST that button submits. This stops link-preview
// / prefetch bots (which issue GET) from silently auto-approving a booking the moment
// the SMS is received.
//
// Flow: GET verify token -> confirm page; POST verify token -> change_appointment_status
// RPC -> notify client SMS -> branded result page.
import { createClient } from 'npm:@supabase/supabase-js@2'
import { SEC_HEADERS } from '../_shared/cors.ts'
import { verifyHmacToken } from '../_shared/crypto.ts'
import { type ClientStatus } from '../_shared/messages.ts'
import { sendClientStatusNotification } from '../_shared/notify.ts'

const ACTION_TO_STATUS: Record<string, ClientStatus> = {
  approve: 'approved',
  reject:  'rejected',
}

function htmlPage(title: string, message: string, tone: 'ok' | 'err'): Response {
  const color = tone === 'ok' ? '#3F7E5A' : '#B4534F'
  const body = `<!doctype html><html lang="he" dir="rtl"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title}</title>
<style>
  body{margin:0;font-family:'Heebo',system-ui,sans-serif;background:#FAF5F0;color:#4A4A4A;
       display:flex;min-height:100vh;align-items:center;justify-content:center;padding:24px}
  .card{background:#fff;border-radius:24px;box-shadow:0 8px 30px rgba(166,124,142,.18);
        padding:36px 28px;max-width:360px;text-align:center}
  h1{font-size:22px;margin:0 0 10px;color:${color}}
  p{font-size:15px;line-height:1.6;margin:0;color:#7A6A70}
  .mark{font-size:46px;margin-bottom:8px}
</style></head><body>
  <div class="card"><div class="mark">${tone === 'ok' ? '✅' : '⚠️'}</div>
  <h1>${title}</h1><p>${message}</p></div>
</body></html>`
  return new Response(body, { status: 200, headers: { ...SEC_HEADERS, 'Content-Type': 'text/html; charset=utf-8' } })
}

function esc(s: string): string {
  return String(s ?? '').replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string))
}

/**
 * Confirmation page rendered on GET. Contains a POST form back to the same link;
 * the actual approve/reject runs only when the admin taps the button (the POST).
 * A prefetch/preview bot issues GET only, so it can never trigger the action.
 */
function confirmPage(
  url: URL, action: string, bookingId: string, token: string,
  targetStatus: ClientStatus, summary: string,
): Response {
  const isApprove = targetStatus === 'approved'
  const verb      = isApprove ? 'לאשר' : 'לדחות'
  const mark      = isApprove ? '✅' : '❌'
  const btnColor  = isApprove ? '#3F7E5A' : '#B4534F'
  const qs = `action=${encodeURIComponent(action)}&bookingId=${encodeURIComponent(bookingId)}&token=${encodeURIComponent(token)}`
  const formAction = (url.pathname + '?' + qs).replace(/&/g, '&amp;')
  const summaryHtml = summary ? `<p class="sum">${esc(summary)}</p>` : ''
  const body = `<!doctype html><html lang="he" dir="rtl"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${verb} תור</title>
<style>
  body{margin:0;font-family:'Heebo',system-ui,sans-serif;background:#FAF5F0;color:#4A4A4A;
       display:flex;min-height:100vh;align-items:center;justify-content:center;padding:24px}
  .card{background:#fff;border-radius:24px;box-shadow:0 8px 30px rgba(166,124,142,.18);
        padding:36px 28px;max-width:360px;text-align:center}
  .mark{font-size:46px;margin-bottom:8px}
  h1{font-size:22px;margin:0 0 8px;color:#4A4A4A}
  .sum{font-size:14px;color:#7A6A70;margin:0 0 20px}
  .btn{display:inline-block;border:0;cursor:pointer;font-family:inherit;background:${btnColor};
       color:#fff;font-size:17px;font-weight:700;padding:14px 30px;border-radius:16px;width:100%}
  .hint{font-size:12px;color:#A89BA0;margin:14px 0 0}
</style></head><body>
  <div class="card">
    <div class="mark">${mark}</div>
    <h1>${verb} את התור?</h1>
    ${summaryHtml}
    <form method="POST" action="${formAction}">
      <button type="submit" class="btn">${verb} עכשיו</button>
    </form>
    <p class="hint">הפעולה תתבצע רק בלחיצה על הכפתור.</p>
  </div>
</body></html>`
  return new Response(body, { status: 200, headers: { ...SEC_HEADERS, 'Content-Type': 'text/html; charset=utf-8' } })
}

// Client notification (approve/reject) is channel-aware and lives in the shared
// helper sendClientStatusNotification (WhatsApp template for WhatsApp bookings,
// else SMS) — see _shared/notify.ts.

Deno.serve(async (req) => {
  try {
    const url       = new URL(req.url)
    const action    = (url.searchParams.get('action') ?? '').toLowerCase()
    const bookingId = url.searchParams.get('bookingId') ?? ''
    const token     = url.searchParams.get('token') ?? ''

    const targetStatus = ACTION_TO_STATUS[action]
    if (!targetStatus || !bookingId || !token) {
      return htmlPage('קישור לא תקין', 'הקישור חסר פרטים. נסי לפעול דרך לוח הניהול.', 'err')
    }

    const secret = (Deno.env.get('HMAC_SECRET') ?? '').trim()
    const ok = await verifyHmacToken(secret, bookingId, token)
    if (!ok) {
      console.warn('[admin-action] invalid-token bookingId=' + bookingId)
      return htmlPage('קישור לא תקין', 'הקישור אינו חוקי או פג תוקפו.', 'err')
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    // GET (or any non-POST) NEVER mutates — render the confirm page only. This is
    // what blocks link-preview/prefetch bots from auto-approving on a bare GET.
    if (req.method !== 'POST') {
      let summary = ''
      try {
        const { data: bk } = await supabase
          .from('bookings_view')
          .select('name, date, time')
          .eq('id', bookingId)
          .maybeSingle()
        if (bk) summary = `${bk.name ?? ''} · ${bk.date ?? ''} ${bk.time ?? ''}`.trim()
      } catch { /* show a generic confirm if the lookup fails */ }
      return confirmPage(url, action, bookingId, token, targetStatus, summary)
    }

    // POST = the admin tapped the confirm button → perform the action.
    console.log('[admin-action] executing status change bookingId=' + bookingId + ' targetStatus=' + targetStatus)
    const { data, error } = await supabase.rpc('change_appointment_status', {
      p_booking_id: bookingId,
      p_new_status: targetStatus,
    })
    if (error) {
      console.error('[admin-action] rpc-error bookingId=' + bookingId + ' error=' + error.message)
      return htmlPage('שגיאה', 'אירעה תקלה בעדכון ההזמנה. נסי שוב מלוח הניהול.', 'err')
    }

    if (data?.success !== true) {
      const err = data?.error
      if (err === 'invalid_transition') {
        return htmlPage('כבר טופל', 'נראה שההזמנה הזו כבר אושרה, נדחתה או בוטלה.', 'err')
      }
      if (err === 'booking_not_found') {
        return htmlPage('הזמנה לא נמצאה', 'לא מצאנו את ההזמנה הזו במערכת.', 'err')
      }
      return htmlPage('שגיאה', 'לא ניתן היה לעדכן את ההזמנה.', 'err')
    }

    try {
      console.log('[admin-action] sending client notification bookingId=' + bookingId + ' status=' + targetStatus)
      await sendClientStatusNotification(supabase, bookingId, targetStatus)
      console.log('[admin-action] client notification sent')
    } catch (smsErr) {
      console.error('[admin-action] client-notify-fail bookingId=' + bookingId + ' error:', smsErr instanceof Error ? smsErr.message : String(smsErr))
    }

    return targetStatus === 'approved'
      ? htmlPage('התור אושר', 'הלקוחה קיבלה הודעה על אישור התור. ההזמנה מופיעה כעת כ"אושר" בלוח.', 'ok')
      : htmlPage('התור נדחה', 'הלקוחה קיבלה הודעה, והחריץ שוחרר לזמינות מחדש.', 'ok')

  } catch (err) {
    console.error('[admin-action] unhandled', err instanceof Error ? err.message : String(err))
    return htmlPage('שגיאה', 'אירעה תקלה כללית. נסי שוב מאוחר יותר.', 'err')
  }
})
