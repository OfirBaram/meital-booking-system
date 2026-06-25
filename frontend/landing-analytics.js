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

document.addEventListener('DOMContentLoaded', () => {
  // Landing page load — richer than the auto $pageview from Mixpanel init
  trackEvent('landing_page_viewed', {
    referrer:         document.referrer || 'direct',
    has_saved_client: !!localStorage.getItem('meital_client'),
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
  [
    ['process',      'process_section_viewed'],
    ['testimonials', 'testimonials_section_viewed'],
  ].forEach(([id, event]) => {
    const el = document.getElementById(id);
    if (!el) return;
    new IntersectionObserver((entries, obs) => {
      entries.forEach(e => {
        if (e.isIntersecting) { trackEvent(event); obs.disconnect(); }
      });
    }, { threshold: 0.5 }).observe(el);
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

  // Track message send via button click or Enter key
  function trackChatSend() {
    const msg = chatInput?.value?.trim();
    if (msg) trackEvent('chat_message_sent', { message_length: msg.length });
  }
  if (chatSend)  chatSend.addEventListener('click', trackChatSend);
  if (chatInput) {
    chatInput.addEventListener('keydown', e => {
      if (e.key === 'Enter' && !e.shiftKey) trackChatSend();
    });
  }

  // WA escalation links are injected dynamically into #chat-messages by the bot
  if (chatMsgs) {
    chatMsgs.addEventListener('click', e => {
      if (e.target.closest('.wa-link')) trackEvent('chat_escalated_to_wa');
    });
  }
});
