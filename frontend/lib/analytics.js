import mixpanel from 'mixpanel-browser';

const TOKEN = '350a74d45d2277767754b88e66a8ee74';
const IS_DEV = import.meta.env?.DEV ?? false;

// First-party ingest. Mixpanel and GA4 are both third-party hosts, so an ad
// blocker drops them and neither can be read back without an API key the
// project does not hold. This endpoint is ours: same origin policy-wise it is
// the Supabase project the site already talks to, and the data lands in a table
// we can query with plain SQL whenever we want to know what happened.
const TRACK_URL = 'https://callmnxlcganwugxwiym.supabase.co/functions/v1/track';

mixpanel.init(TOKEN, {
  debug: IS_DEV,
  track_pageview: true,
  persistence: 'localStorage',
  api_host: 'https://api-eu.mixpanel.com',
});

/**
 * A random id per browser tab. Deliberately sessionStorage and deliberately
 * random: it lets us count visits instead of hits, and it is never derived
 * from a phone number, a name, or anything else that identifies a person.
 */
function sessionId() {
  try {
    let id = sessionStorage.getItem('mn_sid');
    if (!id) {
      id = (crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2) + Date.now().toString(36));
      sessionStorage.setItem('mn_sid', id);
    }
    return id;
  } catch {
    return 'no-storage';
  }
}

function deviceClass() {
  const w = window.innerWidth;
  if (w < 768)  return 'mobile';
  if (w < 1024) return 'tablet';
  return 'desktop';
}

/**
 * Fire-and-forget. sendBeacon survives the page unloading — which matters
 * because the most interesting clicks (WhatsApp, booking) navigate away — and
 * falls back to keepalive fetch where it is unavailable.
 */
function sendFirstParty(event, properties) {
  const payload = JSON.stringify({
    event,
    session_id: sessionId(),
    page:       location.pathname,
    referrer:   document.referrer || 'direct',
    device:     deviceClass(),
    props:      properties,
  });

  try {
    if (navigator.sendBeacon) {
      navigator.sendBeacon(TRACK_URL, new Blob([payload], { type: 'text/plain' }));
      return;
    }
  } catch { /* fall through to fetch */ }

  try {
    fetch(TRACK_URL, { method: 'POST', body: payload, keepalive: true }).catch(() => {});
  } catch { /* analytics must never break the page */ }
}

/**
 * @param {string} event
 * @param {Record<string, unknown>} [properties]
 */
export function trackEvent(event, properties = {}) {
  try {
    mixpanel.track(event, properties);
  } catch (err) {
    console.warn('[Mixpanel] track failed (ad-blocker?):', err);
  }
  sendFirstParty(event, properties);
}

export function identifyUser(phone) {
  try {
    mixpanel.identify(phone);
  } catch (err) {
    console.warn('[Mixpanel] identify failed:', err);
  }
}

export function resetUser() {
  try {
    mixpanel.reset();
  } catch (err) {
    console.warn('[Mixpanel] reset failed:', err);
  }
}

// ── Funnel events, emitted for every page that loads this module ────────────
// The page-specific trackers stay as they are; these two normalise the one
// question that matters across the whole site — did this visit reach an
// outbound booking channel — so the funnel does not depend on remembering to
// wire each new CTA variant.
function initFunnelTracking() {
  sendFirstParty('page_view', {});

  document.addEventListener('click', (e) => {
    const link = e.target.closest?.('a');
    if (!link) return;
    const href = link.getAttribute('href') || '';
    if (href.includes('wa.me') || href.includes('whatsapp')) {
      sendFirstParty('whatsapp_clicked', { from: location.pathname });
    } else if (href.includes('booking.html')) {
      sendFirstParty('booking_clicked', { from: location.pathname });
    }
  }, { capture: true });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initFunnelTracking, { once: true });
} else {
  initFunnelTracking();
}
