import { trackEvent } from './lib/analytics.js';

// Identify social platform from link href — covers all social strip variants.
function platformFromHref(href) {
  if (!href) return null;
  if (href.includes('wa.me') || href.includes('whatsapp')) return 'whatsapp';
  if (href.includes('instagram.com'))                      return 'instagram';
  if (href.includes('tiktok.com'))                         return 'tiktok';
  if (href.includes('waze.com') || href.startsWith('waze://')) return 'waze';
  if (href.includes('easy.co.il'))                         return 'easy';
  return null;
}

// UTM capture. Read once on landing and kept for the session, because the
// parameters survive only the first URL — every later event would otherwise look
// like direct traffic. The server also strips the referrer's query string
// (track/index.ts), so without this an Instagram bio-link visit is
// indistinguishable from someone typing the domain in.
function captureUtm() {
  try {
    const KEY = 'mn_utm';
    const stored = sessionStorage.getItem(KEY);
    if (stored) return JSON.parse(stored);

    const q = new URLSearchParams(location.search);
    const utm = {};
    for (const k of ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term']) {
      const v = q.get(k);
      if (v) utm[k] = v.slice(0, 100);
    }
    // gclid/fbclid mark paid or social traffic that often arrives referrer-less.
    for (const k of ['gclid', 'fbclid']) if (q.get(k)) utm[k] = '1';

    sessionStorage.setItem(KEY, JSON.stringify(utm));
    return utm;
  } catch { return {}; }
}

document.addEventListener('DOMContentLoaded', () => {
  const utm = captureUtm();

  // Landing page load — richer than the auto $pageview from Mixpanel init
  trackEvent('landing_page_viewed', {
    referrer:         document.referrer || 'direct',
    has_saved_client: !!localStorage.getItem('meital_client'),
    ...utm,
  });

  // Every WhatsApp CTA that runs through openWA() — the hero button, the sticky
  // bar and the gallery CTA. None of them is an <a href*="wa.me"> that the
  // delegation below could match: the first two carried href="#" until today and
  // the third is a <button>. The hero CTA is the most important control on the
  // page and it recorded nothing at all.
  document.addEventListener('wa:click', e => {
    trackEvent('whatsapp_clicked', { from: location.pathname, source: String((e.detail || {}).source || 'unknown') });
  });

  // ── Global click delegation ─────────────────────────────────────────────────
  document.body.addEventListener('click', e => {
    const el = e.target.closest('a, button');
    if (!el) return;
    const href = el.getAttribute('href') || '';

    // Hero: WhatsApp CTA
    if (el.classList.contains('btn-primary') && href.includes('wa.me')) {
      trackEvent('hero_cta_clicked', { cta: 'whatsapp' });
      return;
    }
    // Hero: scroll to gallery
    if (el.classList.contains('btn-outline') && href === '#gallery') {
      trackEvent('hero_cta_clicked', { cta: 'gallery' });
      return;
    }
    // Sticky floating book button
    if (el.closest('#sticky-book')) {
      trackEvent('book_now_clicked', { source: 'sticky_bar' });
      return;
    }
    // Desktop / mobile nav anchor links
    if (el.closest('nav') && href.startsWith('#') && href.length > 1) {
      trackEvent('nav_section_clicked', { section: href.slice(1) });
      return;
    }
    // Contact section WhatsApp CTA
    if (el.classList.contains('btn-wa')) {
      trackEvent('contact_whatsapp_clicked');
      return;
    }
    // Service card book button
    if (el.classList.contains('service-book-btn')) {
      trackEvent('service_book_clicked', { service: el.closest('article')?.querySelector('.service-title')?.textContent?.trim() || '' });
      return;
    }
    // Gallery lightbox WA CTA
    if (el.id === 'lb-wa-cta') {
      trackEvent('lightbox_wa_clicked');
      return;
    }
    // Social strip links (header, mobile, footer)
    if (el.closest('#header-social-strip, #mobile-social-strip, #footer-social')) {
      const platform = platformFromHref(href);
      if (platform) trackEvent('social_clicked', { platform });
      return;
    }
    // Contact: phone link
    if (href.startsWith('tel:')) {
      trackEvent('contact_phone_clicked');
      return;
    }
    // Contact: email link
    if (href.startsWith('mailto:')) {
      trackEvent('contact_email_clicked');
      return;
    }
    // Gallery CTA button (below gallery grid — separate from lightbox WA)
    if (el.classList.contains('gallery-cta-btn')) {
      trackEvent('gallery_cta_clicked');
      return;
    }
    // Lightbox close button
    if (el.id === 'lb-close') {
      trackEvent('lightbox_closed');
      return;
    }
    // Lightbox prev / next navigation
    if (el.id === 'lb-prev' || el.id === 'lb-next') {
      trackEvent('lightbox_navigated', { direction: el.id === 'lb-prev' ? 'prev' : 'next' });
      return;
    }
  });

  // ── Mobile menu open / close ────────────────────────────────────────────────
  const menuBtn = document.getElementById('menu-btn');
  if (menuBtn) {
    menuBtn.addEventListener('click', () => {
      const willOpen = menuBtn.getAttribute('aria-expanded') !== 'true';
      trackEvent(willOpen ? 'mobile_menu_opened' : 'mobile_menu_closed');
    });
  }

  // ── Gallery lightbox: which photo the user opens ────────────────────────────
  const galleryGrid = document.getElementById('gallery-grid');
  if (galleryGrid) {
    galleryGrid.addEventListener('click', e => {
      const item = e.target.closest('.gallery-item');
      if (!item) return;
      const items = [...galleryGrid.querySelectorAll('.gallery-item')];
      const caption = item.querySelector('.gallery-caption')?.textContent?.trim() || '';
      trackEvent('gallery_photo_opened', {
        photo_index: items.indexOf(item),
        caption,
      });
    });
  }

  // ── Gallery "show more" button ──────────────────────────────────────────────
  document.addEventListener('click', e => {
    if (e.target.closest('.gallery-more-btn')) {
      trackEvent('gallery_load_more_clicked');
    }
  });

  // ── Section scroll visibility (IntersectionObserver) ───────────────────────
  // Only #process and #testimonials were observed; #about, #services, #gallery,
  // #faq and #contact — five of the seven sections, including the two that carry
  // the actual offer — produced no visibility signal at all. Every section now
  // reports through one generic `section_viewed{section}` rather than a new event
  // name each time, so the ALLOWED set in track/index.ts stops growing per section.
  [
    ['process',      'process_section_viewed'],       // kept: already in ALLOWED and in the views
    ['testimonials', 'testimonials_section_viewed'],  // kept for the same reason
    ['about',        null],
    ['services',     null],
    ['gallery',      null],
    ['faq',          null],
    ['contact',      null],
  ].forEach(([id, event]) => {
    const el = document.getElementById(id);
    if (!el) return;
    // threshold:0.5 was unreachable for any section taller than the viewport —
    // 50% of a 1500px section can never be visible in a 700px window, so those
    // sections would never report no matter how long someone read them.
    // Instead: shrink the root to the middle half of the viewport and fire when
    // the section crosses it. That is height-independent and reads as "this
    // section was actually in front of the user".
    new IntersectionObserver((entries, obs) => {
      entries.forEach(e => {
        if (e.isIntersecting) {
          if (event) trackEvent(event);
          else       trackEvent('section_viewed', { section: id });
          obs.disconnect();
        }
      });
    }, { threshold: 0, rootMargin: '-25% 0px -25% 0px' }).observe(el);
  });

  // ── Reel mute / unmute ──────────────────────────────────────────────────────
  // aria-pressed="false" = sound OFF; "true" = sound ON.
  // Microtask ensures the reel's own click handler updates aria-pressed first.
  const reelMuteBtn = document.getElementById('reel-mute-btn');
  if (reelMuteBtn) {
    reelMuteBtn.addEventListener('click', () => {
      Promise.resolve().then(() => {
        const nowOn = reelMuteBtn.getAttribute('aria-pressed') === 'true';
        trackEvent(nowOn ? 'reel_unmuted' : 'reel_muted');
      });
    });
  }

  // ── FAQ accordion ───────────────────────────────────────────────────────────
  // 'toggle' on <details> does not bubble — capture phase on the container.
  const faqList = document.getElementById('faq-list');
  if (faqList) {
    faqList.addEventListener('toggle', e => {
      const details = e.target.closest('details');
      if (!details || !details.open) return;
      const question = details.querySelector('summary')?.textContent?.trim() || '';
      trackEvent('faq_item_opened', { question });
    }, true);
  }

  // ── Scroll depth (25 / 50 / 75 / 100 %) ────────────────────────────────────
  const depthFired = new Set();
  const depthThresholds = [25, 50, 75, 100];

  function checkScrollDepth() {
    const scrolled = window.scrollY + window.innerHeight;
    const total    = document.documentElement.scrollHeight;
    const pct      = Math.floor((scrolled / total) * 100);

    for (const t of depthThresholds) {
      if (pct >= t && !depthFired.has(t)) {
        depthFired.add(t);
        trackEvent('scroll_depth', { depth: t });
      }
    }
    if (depthFired.size === depthThresholds.length) {
      window.removeEventListener('scroll', checkScrollDepth);
    }
  }
  window.addEventListener('scroll', checkScrollDepth, { passive: true });

  // ── Chatbot ─────────────────────────────────────────────────────────────────
  const chatBubble = document.getElementById('chat-bubble');
  const chatClose  = document.getElementById('chat-close');
  const chatSend   = document.getElementById('chat-send');
  const chatInput  = document.getElementById('chat-input');
  const chatMsgs   = document.getElementById('chat-messages');

  if (chatBubble) {
    chatBubble.addEventListener('click', () => trackEvent('chat_opened'));
  }
  if (chatClose) {
    chatClose.addEventListener('click', () => trackEvent('chat_closed'));
  }

  // chat_message_sent is emitted from inside the widget's send(), via 'chat:sent'.
  //
  // It used to be bound here to the #chat-send click and the Enter keydown. The
  // quick-reply chips call send() programmatically — no click on #chat-send, no
  // keydown — so every conversation started from a chip was counted as zero
  // messages. The welcome message ships four chips, so that was the main entry
  // point into the bot and it was missing from the data entirely.
  document.addEventListener('chat:sent', e => {
    const d = e.detail || {};
    trackEvent('chat_message_sent', {
      message_length: Number(d.message_length) || 0,
      via:            String(d.via || 'input'),   // 'input' | 'quick_reply'
    });
  });

  // Which canned prompt people actually press — the fastest read on what the
  // welcome message should offer.
  document.addEventListener('chat:quickreply', e => {
    trackEvent('chat_quick_reply_clicked', { label: String((e.detail || {}).label || '') });
  });

  // The widget dispatches 'chat:reply' when an answer lands. It is an inline
  // (non-module) script, so a CustomEvent is the seam between it and this file.
  //
  // `source` is the value worth watching: 'ai' means chat-handler answered,
  // 'offline' means the request failed and the local fallback table answered,
  // 'unavailable' means the kill switch or a rate limit replied. A rising
  // offline share is the signal that the bot is silently degraded — the
  // customer still sees an answer, so nothing else would surface it.
  //
  // Metadata only. Never send message text: /track rejects anything resembling
  // PII with a 400 rather than sanitising it, on purpose.
  document.addEventListener('chat:reply', e => {
    const d = e.detail || {};
    trackEvent('chat_reply_received', {
      latency_ms:   Number(d.latency_ms) || 0,
      source:       String(d.source || 'unknown'),
      reply_length: Number(d.reply_length) || 0,
    });
  });

  // WA escalation links are injected dynamically into #chat-messages by the bot.
  // The Instagram and TikTok links the bot emits live in the same container and
  // were not attributed to anything, so portfolio traffic driven by the bot was
  // invisible.
  if (chatMsgs) {
    chatMsgs.addEventListener('click', e => {
      if (e.target.closest('.wa-link')) { trackEvent('chat_escalated_to_wa'); return; }
      if (e.target.closest('.ig-link')) { trackEvent('social_clicked', { platform: 'instagram', source: 'chat' }); return; }
      if (e.target.closest('.tk-link')) { trackEvent('social_clicked', { platform: 'tiktok',    source: 'chat' }); }
    });
  }

  // ── Dwell time ──────────────────────────────────────────────────────────────
  // No time-on-page metric existed at all, so "did anyone actually read this?"
  // was unanswerable. `pagehide` fires reliably on mobile (unlike `beforeunload`)
  // and sendBeacon is already the transport, so this survives the unload.
  // Guarded against double-fire: pagehide and visibilitychange can both run.
  let _dwellSent = false;
  const _startedAt = Date.now();
  function sendDwell() {
    if (_dwellSent) return;
    _dwellSent = true;
    const seconds = Math.round((Date.now() - _startedAt) / 1000);
    // Bucketed, and capped well under the PII_RE trap in track/index.ts — that
    // regex rejects any run of 9+ digits, so a raw millisecond value would 400.
    if (seconds > 0 && seconds < 86400) trackEvent('time_on_page', { seconds });
  }
  window.addEventListener('pagehide', sendDwell);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') sendDwell();
  });
});
